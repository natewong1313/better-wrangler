/**
 * Global setup for deployment tests
 */

import { beforeAll, afterAll } from "vitest";

// Verify required environment variables are set
beforeAll(() => {
	const runId = process.env.CI_RUN_ID;
	if (!runId) {
		throw new Error(
			"CI_RUN_ID environment variable is required for deployment tests"
		);
	}
});

// Global timeout for all tests
afterAll(() => {
	// Nothing to clean up - cleanup is handled by the CI workflow
});
