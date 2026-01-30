import { Worker } from "better-wrangler";

export const worker = Worker({
	name: "hello-world",
	entryPoint: "./src/index.ts",
	port: 6900,
	bindings: {},
});
