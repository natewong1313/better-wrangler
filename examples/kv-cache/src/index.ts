import { worker } from "../bw.config";

export default {
	async fetch(req: Request, env: typeof worker.Env): Promise<Response> {
		const url = new URL(req.url);
		const path = url.pathname;

		// GET /cache - list all keys
		if (req.method === "GET" && path === "/cache") {
			const list = await env.CACHE.list();
			return Response.json({ keys: list.keys.map((k) => k.name) });
		}

		// Extract key from /cache/:key
		const match = path.match(/^\/cache\/(.+)$/);
		if (!match) {
			return new Response("Use /cache or /cache/:key", { status: 404 });
		}
		const key = match[1];

		// GET /cache/:key - get value
		if (req.method === "GET") {
			const value = await env.CACHE.get(key);
			if (value === null) {
				return new Response("Not found", { status: 404 });
			}
			return new Response(value);
		}

		// PUT /cache/:key - store value
		if (req.method === "PUT") {
			const value = await req.text();
			await env.CACHE.put(key, value);
			return new Response("Stored", { status: 201 });
		}

		// DELETE /cache/:key - delete value
		if (req.method === "DELETE") {
			await env.CACHE.delete(key);
			return new Response("Deleted", { status: 200 });
		}

		return new Response("Method not allowed", { status: 405 });
	},
};
