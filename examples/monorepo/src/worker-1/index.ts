import { worker1 } from "../../bw.config";

export default {
  async fetch(req: Request, env: typeof worker1.Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/do") {
      const stub = env.DO.getByName("test");
      const count = await stub.getCount();
      return new Response(`Worker 1 - DO count: ${count}`);
    }

    if (url.pathname === "/db") {
      const result = await env.DB.prepare("SELECT 1 as value").first();
      return new Response(`Worker 1 - DB result: ${JSON.stringify(result)}`);
    }

    return new Response("Worker 1 - Use /do or /db");
  },
};
