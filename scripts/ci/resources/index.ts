/**
 * Resource handlers for CI deployment tests
 *
 * This module provides a unified interface for creating and deleting
 * Cloudflare resources during CI testing.
 */

import { CloudflareClient } from "../cloudflare-client";
import {
	type ResourceDefinition,
	type DeployedResource,
	type ResourceType,
	getCIResourceName,
	isCIResource,
	isCIWorker,
} from "./types";

export * from "./types";

/**
 * Resource manager that handles creating and deleting Cloudflare resources
 */
export class ResourceManager {
	constructor(private client: CloudflareClient) {}

	/**
	 * Create a resource with a CI-specific name
	 */
	async createResource(
		resource: ResourceDefinition,
		example: string,
		runId: string
	): Promise<DeployedResource> {
		const ciName = getCIResourceName(
			example,
			resource.type,
			resource.name,
			runId
		);

		let id: string;

		switch (resource.type) {
			case "kv": {
				const kv = await this.client.createKVNamespace(ciName);
				id = kv.id;
				break;
			}
			case "r2": {
				await this.client.createR2Bucket(ciName);
				id = ciName; // R2 uses bucket name as ID
				break;
			}
			case "d1": {
				const db = await this.client.createD1Database(ciName);
				id = db.uuid;
				break;
			}
			default:
				throw new Error(`Unsupported resource type: ${resource.type}`);
		}

		console.log(`  Created ${resource.type}: ${ciName} (id: ${id})`);

		return {
			...resource,
			id,
			ciName,
		};
	}

	/**
	 * Delete a deployed resource
	 */
	async deleteResource(resource: DeployedResource): Promise<void> {
		switch (resource.type) {
			case "kv":
				await this.client.deleteKVNamespace(resource.id);
				break;
			case "r2":
				// Empty bucket first, then delete
				try {
					await this.client.emptyR2Bucket(resource.ciName);
				} catch {
					// Bucket might already be empty or not exist
				}
				await this.client.deleteR2Bucket(resource.ciName);
				break;
			case "d1":
				await this.client.deleteD1Database(resource.id);
				break;
			default:
				throw new Error(`Unsupported resource type: ${resource.type}`);
		}

		console.log(`  Deleted ${resource.type}: ${resource.ciName}`);
	}

	/**
	 * Create multiple resources
	 */
	async createResources(
		resources: ResourceDefinition[],
		example: string,
		runId: string
	): Promise<DeployedResource[]> {
		const deployed: DeployedResource[] = [];
		for (const resource of resources) {
			const result = await this.createResource(resource, example, runId);
			deployed.push(result);
		}
		return deployed;
	}

	/**
	 * Delete multiple resources
	 */
	async deleteResources(resources: DeployedResource[]): Promise<void> {
		for (const resource of resources) {
			try {
				await this.deleteResource(resource);
			} catch (error) {
				console.error(
					`  Failed to delete ${resource.type} ${resource.ciName}:`,
					error
				);
			}
		}
	}

	/**
	 * List all CI resources of a given type
	 */
	async listCIResources(type: ResourceType): Promise<{ name: string; id: string }[]> {
		switch (type) {
			case "kv": {
				const namespaces = await this.client.listKVNamespaces();
				return namespaces
					.filter((ns) => isCIResource(ns.title))
					.map((ns) => ({ name: ns.title, id: ns.id }));
			}
			case "r2": {
				const buckets = await this.client.listR2Buckets();
				return buckets
					.filter((b) => isCIResource(b.name))
					.map((b) => ({ name: b.name, id: b.name }));
			}
			case "d1": {
				const databases = await this.client.listD1Databases();
				return databases
					.filter((db) => isCIResource(db.name))
					.map((db) => ({ name: db.name, id: db.uuid }));
			}
			default:
				throw new Error(`Unsupported resource type: ${type}`);
		}
	}

	/**
	 * Clean up all CI resources matching a pattern (for stale cleanup)
	 */
	async cleanupStaleResources(
		maxAgeMs: number = 6 * 60 * 60 * 1000 // 6 hours default
	): Promise<{ deleted: number; errors: string[] }> {
		const cutoff = Date.now() - maxAgeMs;
		let deleted = 0;
		const errors: string[] = [];

		// Clean up KV namespaces
		try {
			const kvNamespaces = await this.client.listKVNamespaces();
			for (const ns of kvNamespaces.filter((n) => isCIResource(n.title))) {
				// We can't easily get creation time for KV, so we'd need to track it separately
				// For now, just delete all CI resources (this is called by scheduled cleanup)
				try {
					await this.client.deleteKVNamespace(ns.id);
					deleted++;
					console.log(`  Deleted stale KV: ${ns.title}`);
				} catch (e) {
					errors.push(`KV ${ns.title}: ${e}`);
				}
			}
		} catch (e) {
			errors.push(`Failed to list KV namespaces: ${e}`);
		}

		// Clean up R2 buckets
		try {
			const buckets = await this.client.listR2Buckets();
			for (const bucket of buckets.filter((b) => isCIResource(b.name))) {
				try {
					await this.client.emptyR2Bucket(bucket.name);
					await this.client.deleteR2Bucket(bucket.name);
					deleted++;
					console.log(`  Deleted stale R2: ${bucket.name}`);
				} catch (e) {
					errors.push(`R2 ${bucket.name}: ${e}`);
				}
			}
		} catch (e) {
			errors.push(`Failed to list R2 buckets: ${e}`);
		}

		// Clean up D1 databases
		try {
			const databases = await this.client.listD1Databases();
			for (const db of databases.filter((d) => isCIResource(d.name))) {
				try {
					await this.client.deleteD1Database(db.uuid);
					deleted++;
					console.log(`  Deleted stale D1: ${db.name}`);
				} catch (e) {
					errors.push(`D1 ${db.name}: ${e}`);
				}
			}
		} catch (e) {
			errors.push(`Failed to list D1 databases: ${e}`);
		}

		// Clean up workers
		try {
			const workers = await this.client.listWorkers();
			for (const worker of workers.filter((w) => isCIWorker(w.id))) {
				try {
					await this.client.deleteWorker(worker.id);
					deleted++;
					console.log(`  Deleted stale worker: ${worker.id}`);
				} catch (e) {
					errors.push(`Worker ${worker.id}: ${e}`);
				}
			}
		} catch (e) {
			errors.push(`Failed to list workers: ${e}`);
		}

		return { deleted, errors };
	}
}
