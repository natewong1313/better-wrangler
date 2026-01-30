import { worker } from "../bw.config";

type Env = typeof worker.Env;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // GET / - List all endpoints
    if (path === "/" && method === "GET") {
      return Response.json({
        message: "Kitchen Sink Example - R2 + KV + Durable Objects",
        endpoints: {
          r2: {
            "GET /r2": "List all files",
            "GET /r2/:key": "Download a file",
            "PUT /r2/:key": "Upload a file (body = file content)",
            "DELETE /r2/:key": "Delete a file",
          },
          kv: {
            "GET /kv": "List all keys",
            "GET /kv/:key": "Get a value",
            "PUT /kv/:key": "Set a value (body = value)",
            "DELETE /kv/:key": "Delete a key",
          },
          do: {
            "GET /do/:id": "Get counter value",
            "POST /do/:id/increment": "Increment counter",
            "POST /do/:id/decrement": "Decrement counter",
            "POST /do/:id/reset": "Reset counter to 0",
          },
        },
      });
    }

    // === R2 Routes ===
    if (path === "/r2" && method === "GET") {
      const list = await env.BUCKET.list();
      return Response.json({
        objects: list.objects.map((o: R2Object) => ({
          key: o.key,
          size: o.size,
          uploaded: o.uploaded,
        })),
      });
    }

    if (path.startsWith("/r2/")) {
      const key = path.slice(4); // Remove "/r2/"

      if (method === "GET") {
        const object = await env.BUCKET.get(key);
        if (!object) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        return new Response(object.body, {
          headers: {
            "Content-Type":
              object.httpMetadata?.contentType ?? "application/octet-stream",
          },
        });
      }

      if (method === "PUT") {
        const body = await request.arrayBuffer();
        await env.BUCKET.put(key, body, {
          httpMetadata: {
            contentType:
              request.headers.get("Content-Type") ?? "application/octet-stream",
          },
        });
        return Response.json({ success: true, key });
      }

      if (method === "DELETE") {
        await env.BUCKET.delete(key);
        return Response.json({ success: true, key });
      }
    }

    // === KV Routes ===
    if (path === "/kv" && method === "GET") {
      const list = await env.CACHE.list();
      return Response.json({ keys: list.keys.map((k: KVNamespaceListKey<unknown, string>) => k.name) });
    }

    if (path.startsWith("/kv/")) {
      const key = path.slice(4); // Remove "/kv/"

      if (method === "GET") {
        const value = await env.CACHE.get(key);
        if (value === null) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        return Response.json({ key, value });
      }

      if (method === "PUT") {
        const value = await request.text();
        await env.CACHE.put(key, value);
        return Response.json({ success: true, key });
      }

      if (method === "DELETE") {
        await env.CACHE.delete(key);
        return Response.json({ success: true, key });
      }
    }

    // === Durable Object Routes ===
    if (path.startsWith("/do/")) {
      const parts = path.slice(4).split("/"); // Remove "/do/"
      const id = parts[0];
      const action = parts[1];

      const stub = env.COUNTER.getByName(id);

      if (method === "GET" && !action) {
        const count = await stub.getCount();
        return Response.json({ id, count });
      }

      if (method === "POST") {
        if (action === "increment") {
          const count = await stub.increment();
          return Response.json({ id, count });
        }
        if (action === "decrement") {
          const count = await stub.decrement();
          return Response.json({ id, count });
        }
        if (action === "reset") {
          const count = await stub.reset();
          return Response.json({ id, count });
        }
      }
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },
};

export { Counter } from "./counter-do";
