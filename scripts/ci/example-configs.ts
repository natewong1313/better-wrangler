/**
 * Example configurations for CI deployment tests
 *
 * This is the single source of truth for example configurations.
 * Used by both deploy.ts and cleanup.ts.
 */

export interface ExampleResourceConfig {
	type: "kv" | "r2" | "d1";
	name: string;
	binding: string;
}

export interface ExampleConfig {
	workers: string[];
	resources: ExampleResourceConfig[];
}

/**
 * Configuration for each example that can be deployed
 */
export const EXAMPLE_CONFIGS: Record<string, ExampleConfig> = {
	"kv-cache": {
		workers: ["kv-cache"],
		resources: [{ type: "kv", name: "cache", binding: "CACHE" }],
	},
	"r2-storage": {
		workers: ["r2-storage"],
		resources: [{ type: "r2", name: "my-bucket", binding: "BUCKET" }],
	},
	monorepo: {
		workers: ["worker-1", "worker-2"],
		resources: [{ type: "d1", name: "my-db", binding: "DB" }],
	},
};

/**
 * Get the list of available example names
 */
export function getAvailableExamples(): string[] {
	return Object.keys(EXAMPLE_CONFIGS);
}

/**
 * Get configuration for a specific example
 * @throws Error if example doesn't exist
 */
export function getExampleConfig(example: string): ExampleConfig {
	const config = EXAMPLE_CONFIGS[example];
	if (!config) {
		throw new Error(
			`Unknown example: ${example}. Available examples: ${getAvailableExamples().join(", ")}`
		);
	}
	return config;
}
