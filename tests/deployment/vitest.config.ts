import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["tests/deployment/**/*.test.ts"],
		setupFiles: ["tests/deployment/setup.ts"],
		testTimeout: 30000, // 30 seconds per test
		hookTimeout: 60000, // 60 seconds for setup/teardown
		retry: 1, // Retry failed tests once (network issues)
		reporters: ["verbose"],
		// Run tests sequentially to avoid rate limiting
		sequence: {
			concurrent: false,
		},
		fileParallelism: false,
	},
});
