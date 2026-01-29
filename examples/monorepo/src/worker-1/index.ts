import { worker1 } from "../../bw.config";
import { jsonResponse, errorResponse, getPathParam } from "../shared/utils";
import type { KVEntry, R2ObjectInfo } from "../shared/types";

export default {
	async fetch(req: Request, env: typeof worker1.Env): Promise<Response> {
		const url = new URL(req.url);
		const { pathname } = url;

		// Durable Object routes
		if (pathname === "/do") {
			const stub = env.DO.getByName("counter");
			const state = await stub.increment();
			return jsonResponse({ worker: "worker-1", ...state });
		}

		if (pathname === "/do/reset") {
			const stub = env.DO.getByName("counter");
			const state = await stub.reset();
			return jsonResponse({ worker: "worker-1", ...state });
		}

		// D1 Database route
		if (pathname === "/db") {
			const result = await env.DB.prepare(
				"SELECT 1 as value, datetime('now') as timestamp"
			).first();
			return jsonResponse({ worker: "worker-1", result });
		}

		// KV routes
		const kvKey = getPathParam(pathname, "/kv/");
		if (kvKey) {
			if (req.method === "GET") {
				const value = await env.KV.get(kvKey);
				if (value === null) {
					return errorResponse(`Key "${kvKey}" not found`, 404);
				}
				const entry: KVEntry = { key: kvKey, value };
				return jsonResponse({ worker: "worker-1", entry });
			}

			if (req.method === "PUT") {
				const value = await req.text();
				await env.KV.put(kvKey, value);
				const entry: KVEntry = { key: kvKey, value };
				return jsonResponse({ worker: "worker-1", entry, action: "created" });
			}
		}

		// R2 routes
		const r2Key = getPathParam(pathname, "/r2/");
		if (r2Key) {
			if (req.method === "GET") {
				const object = await env.BUCKET.get(r2Key);
				if (object === null) {
					return errorResponse(`Object "${r2Key}" not found`, 404);
				}
				const info: R2ObjectInfo = {
					key: r2Key,
					size: object.size,
					etag: object.etag,
					uploaded: object.uploaded.toISOString(),
				};
				return jsonResponse({ worker: "worker-1", object: info });
			}

			if (req.method === "PUT") {
				const body = await req.arrayBuffer();
				const object = await env.BUCKET.put(r2Key, body);
				const info: R2ObjectInfo = {
					key: r2Key,
					size: object.size,
					etag: object.etag,
					uploaded: object.uploaded.toISOString(),
				};
				return jsonResponse({ worker: "worker-1", object: info, action: "uploaded" });
			}
		}

		// Help route
		return jsonResponse({
			worker: "worker-1",
			description: "Primary worker with all bindings",
			routes: {
				"GET /do": "Increment shared counter",
				"GET /do/reset": "Reset shared counter",
				"GET /db": "Query D1 database",
				"GET /kv/:key": "Get value from KV",
				"PUT /kv/:key": "Set value in KV",
				"GET /r2/:key": "Get object info from R2",
				"PUT /r2/:key": "Upload object to R2",
			},
		});
	},
};
