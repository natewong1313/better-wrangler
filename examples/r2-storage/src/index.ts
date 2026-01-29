import type { InferEnv } from "better-wrangler";
import type { worker } from "../bw.config";

type Env = InferEnv<typeof worker.bindings>;

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // GET /objects - List all objects
    if (request.method === "GET" && path === "/objects") {
      const listed = await env.BUCKET.list();
      const keys = listed.objects.map((obj: R2Object) => ({
        key: obj.key,
        size: obj.size,
        uploaded: obj.uploaded,
      }));
      return Response.json({ objects: keys });
    }

    // Match /objects/:key routes
    const match = path.match(/^\/objects\/(.+)$/);
    if (!match) {
      return new Response("Not Found", { status: 404 });
    }

    const key = decodeURIComponent(match[1]);

    switch (request.method) {
      // GET /objects/:key - Get object
      case "GET": {
        const object = await env.BUCKET.get(key);
        if (!object) {
          return new Response("Not Found", { status: 404 });
        }

        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set("etag", object.httpEtag);

        return new Response(object.body, { headers });
      }

      // PUT /objects/:key - Upload object
      case "PUT": {
        const contentType = request.headers.get("content-type") ?? "application/octet-stream";
        await env.BUCKET.put(key, request.body, {
          httpMetadata: { contentType },
        });
        return new Response("Created", { status: 201 });
      }

      // DELETE /objects/:key - Delete object
      case "DELETE": {
        await env.BUCKET.delete(key);
        return new Response("Deleted", { status: 200 });
      }

      default:
        return new Response("Method Not Allowed", { status: 405 });
    }
  },
};
