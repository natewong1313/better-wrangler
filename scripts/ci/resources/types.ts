/**
 * Type definitions for CI deployment resources
 *
 * This file defines the resource types that can be managed by the CI system.
 * It's designed to be extensible for future resource types.
 */

/**
 * Supported Cloudflare resource types
 */
export type ResourceType = "kv" | "r2" | "d1" | "worker";

/**
 * Base resource definition - what's declared in an example's config
 */
export interface ResourceDefinition {
	type: ResourceType;
	/** Name as declared in the example (e.g., "cache", "my-bucket") */
	name: string;
	/** Binding name used in the worker code */
	binding: string;
	/** Additional type-specific configuration */
	config?: Record<string, unknown>;
}

/**
 * A deployed resource with its actual Cloudflare ID
 */
export interface DeployedResource extends ResourceDefinition {
	/** The actual Cloudflare resource ID */
	id: string;
	/** The CI-specific name used for this resource */
	ciName: string;
}

/**
 * Worker definition within an example
 */
export interface WorkerDefinition {
	/** Worker name as declared in the example */
	name: string;
	/** Path to the worker's entry point relative to example directory */
	entryPoint: string;
	/** Port for local dev (informational) */
	port?: number;
	/** Resources this worker uses */
	bindings: ResourceDefinition[];
}

/**
 * Complete example configuration
 */
export interface ExampleConfig {
	/** Example directory name (e.g., "kv-cache") */
	name: string;
	/** Workers defined in this example */
	workers: WorkerDefinition[];
}

/**
 * Deployment result for a single worker
 */
export interface DeployedWorker {
	/** Original worker name */
	originalName: string;
	/** CI-specific worker name */
	ciName: string;
	/** Full URL to the deployed worker */
	url: string;
}

/**
 * Complete deployment result for an example
 */
export interface DeploymentResult {
	/** Example name */
	example: string;
	/** CI run ID used for naming */
	runId: string;
	/** Deployed workers */
	workers: DeployedWorker[];
	/** Deployed resources */
	resources: DeployedResource[];
	/** Workers subdomain */
	subdomain: string;
}

/**
 * CI naming utilities
 */
export function getCIWorkerName(
	example: string,
	workerName: string,
	runId: string
): string {
	// For single-worker examples, just use example-ci-runId
	// For multi-worker examples, use example-ci-runId-workerName
	const base = `${example}-ci-${runId}`;
	if (workerName === example || workerName === "worker") {
		return base;
	}
	return `${base}-${workerName}`;
}

export function getCIResourceName(
	example: string,
	resourceType: ResourceType,
	resourceName: string,
	runId: string
): string {
	return `ci-${example}-${resourceType}-${resourceName}-${runId}`;
}

export function getWorkerUrl(workerName: string, subdomain: string): string {
	return `https://${workerName}.${subdomain}.workers.dev`;
}

/**
 * Parse a CI resource name back to its components
 */
export function parseCIResourceName(ciName: string): {
	example: string;
	resourceType: ResourceType;
	resourceName: string;
	runId: string;
} | null {
	const match = ciName.match(/^ci-(.+)-(kv|r2|d1)-(.+)-(\d+)$/);
	if (!match) return null;
	return {
		example: match[1],
		resourceType: match[2] as ResourceType,
		resourceName: match[3],
		runId: match[4],
	};
}

/**
 * Check if a resource name matches the CI naming pattern
 */
export function isCIResource(name: string): boolean {
	return /^ci-.+-(kv|r2|d1)-.+-\d+$/.test(name);
}

/**
 * Check if a worker name matches the CI naming pattern
 */
export function isCIWorker(name: string): boolean {
	return /^.+-ci-\d+/.test(name);
}
