import { worker2 } from "../../bw.config";
import { jsonResponse, errorResponse, getPathParam } from "../shared/utils";
import type { KVEntry } from "../shared/types";

export default {
	async fetch(req: Request, env: typeof worker2.Env): Promise<Response> {
		const url = new URL(req.url);
		const { pathname } = url;

		// Durable Object routes - accessing the shared DO from worker-1
		if (pathname === "/do") {
			const stub = env.DO.getByName("counter");
			const state = await stub.increment();
			return jsonResponse({ worker: "worker-2", shared: true, ...state });
		}

		if (pathname === "/do/state") {
			const stub = env.DO.getByName("counter");
			const state = await stub.getState();
			return jsonResponse({ worker: "worker-2", shared: true, ...state });
		}

		// KV routes - accessing the shared KV from worker-1
		const kvKey = getPathParam(pathname, "/kv/");
		if (kvKey) {
			if (req.method === "GET") {
				const value = await env.KV.get(kvKey);
				if (value === null) {
					return errorResponse(`Key "${kvKey}" not found`, 404);
				}
				const entry: KVEntry = { key: kvKey, value };
				return jsonResponse({ worker: "worker-2", shared: true, entry });
			}

			if (req.method === "PUT") {
				const value = await req.text();
				await env.KV.put(kvKey, value);
				const entry: KVEntry = { key: kvKey, value };
				return jsonResponse({ worker: "worker-2", shared: true, entry, action: "created" });
			}
		}

		// Help route
		return jsonResponse({
			worker: "worker-2",
			description: "Secondary worker with shared bindings from worker-1",
			routes: {
				"GET /do": "Increment shared counter (same DO as worker-1)",
				"GET /do/state": "Get shared counter state without incrementing",
				"GET /kv/:key": "Get value from shared KV",
				"PUT /kv/:key": "Set value in shared KV",
			},
		});
	},
};
