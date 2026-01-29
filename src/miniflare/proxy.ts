import { createServer, type Server } from "http";
import { Readable } from "stream";
import type { Miniflare } from "miniflare";

export type WorkerProxy = {
  server: Server;
  url: URL;
};

/**
 * Creates an HTTP server that proxies requests to a Miniflare worker
 */
export async function createWorkerProxy(
  mf: Miniflare,
  workerName: string,
  port: number,
): Promise<WorkerProxy> {
  const server = createServer(async (req, res) => {
    try {
      const mfWorker = await mf.getWorker(workerName);

      const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);

      const bodyChunks: Buffer[] = [];
      for await (const chunk of req) {
        bodyChunks.push(chunk);
      }
      const body =
        bodyChunks.length > 0 ? Buffer.concat(bodyChunks) : undefined;

      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value) {
          if (Array.isArray(value)) {
            for (const v of value) {
              headers.append(key, v);
            }
          } else {
            headers.set(key, value);
          }
        }
      }

      const request = new Request(url.toString(), {
        method: req.method,
        headers,
        body:
          body && req.method !== "GET" && req.method !== "HEAD"
            ? body
            : undefined,
      });

      // Call the miniflare workers fetch handler
      const response = await mfWorker.fetch(request as any);

      res.statusCode = response.status;
      response.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });

      // We stream the response body instead of buffering
      if (response.body) {
        const readable = Readable.fromWeb(response.body as any);
        readable.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      console.error(`Error handling request to ${workerName}:`, error);
      res.statusCode = 500;
      res.end(`Internal Server Error: ${error}`);
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => {
      resolve();
    });
  });

  return {
    server,
    url: new URL(`http://127.0.0.1:${port}/`),
  };
}
