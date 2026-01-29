import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		root: ".",
		include: ["tests/**/*.test.ts"],
		exclude: ["examples/**", ".better-wrangler/**", "node_modules/**"],
		setupFiles: ["tests/setup.ts"],
		coverage: {
			provider: "v8",
			reporter: ["text", "html"],
			include: ["src/**/*.ts"],
			exclude: [
				"src/cli.ts",
				"src/preload.ts",
				"src/logger/**",
				"src/mocks/**",
			],
			thresholds: {
				statements: 75,
				branches: 70,
				functions: 75,
				lines: 75,
			},
		},
		testTimeout: 30000,
	},
});
