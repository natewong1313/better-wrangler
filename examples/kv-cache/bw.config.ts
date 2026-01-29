import { Worker, KV } from "better-wrangler";

export const worker = Worker({
	name: "kv-cache",
	entryPoint: "./src/index.ts",
	port: 6800,
	bindings: {
		CACHE: KV({ name: "cache", id: "ac7bf88f02574d56bc08858b86944f33" }),
	},
});
