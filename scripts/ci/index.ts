/**
 * CI deployment test scripts
 *
 * This module provides utilities for deploying examples to Cloudflare
 * during CI testing and cleaning them up afterward.
 *
 * Main entry points:
 * - deploy.ts: Deploy an example with CI-specific naming
 * - cleanup.ts: Clean up resources after testing
 *
 * Usage:
 *   bun run ci:deploy <example-name>
 *   bun run ci:cleanup <example-name>
 *   bun run ci:cleanup --stale
 */

export * from "./cloudflare-client";
export * from "./resources";
export * from "./utils";
