import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		root: ".",
		include: ["tests/**/*.test.ts"],
		exclude: [
			"examples/**",
			".better-wrangler/**",
			"node_modules/**",
			"tests/deployment/**", // Deployment tests run separately via test:deployment
		],
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
		},
		testTimeout: 30000,
	},
});
