import { createServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "http";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve, join, extname } from "path";

const DEFAULT_PORT = 5173;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export type ViteServerResult = {
  url: string;
  stop: () => Promise<void>;
};

/**
 * MIME types for common static file extensions.
 */
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
};

/**
 * Check if pre-built UI exists (production) or use source UI (development).
 */
function getUIPath(): { path: string; isPrebuilt: boolean } {
  // Check for pre-built UI in dist (production)
  const prebuiltPath = resolve(__dirname, "devtools-ui");
  if (existsSync(join(prebuiltPath, "index.html"))) {
    return { path: prebuiltPath, isPrebuilt: true };
  }

  // Fall back to source UI (development)
  const sourcePath = resolve(__dirname, "ui");
  return { path: sourcePath, isPrebuilt: false };
}

/**
 * Start a simple static file server for the pre-built UI.
 */
async function startStaticServer(
  uiRoot: string,
  port: number,
  wsPort: number,
  httpPort: number,
): Promise<ViteServerResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const server = createHttpServer((req: IncomingMessage, res: ServerResponse) => {
      // Enable CORS
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url || "/", `http://localhost:${port}`);
      let pathname = url.pathname;

      // Inject port params for the UI to read
      if (pathname === "/" || pathname === "/index.html") {
        // Redirect to include port params if not present
        if (!url.searchParams.has("wsPort")) {
          url.searchParams.set("wsPort", wsPort.toString());
          url.searchParams.set("httpPort", httpPort.toString());
          res.writeHead(302, { Location: url.pathname + url.search });
          res.end();
          return;
        }
      }

      // Determine file path
      let filePath = join(uiRoot, pathname);

      // Handle SPA routing - if file doesn't exist and isn't a static asset, serve index.html
      if (!existsSync(filePath) || pathname === "/") {
        const ext = extname(pathname);
        if (!ext || !MIME_TYPES[ext]) {
          filePath = join(uiRoot, "index.html");
        }
      }

      // Check if file exists
      if (!existsSync(filePath)) {
        res.writeHead(404);
        res.end("Not Found");
        return;
      }

      // Read and serve the file
      try {
        const content = readFileSync(filePath);
        const ext = extname(filePath);
        const mimeType = MIME_TYPES[ext] || "application/octet-stream";

        res.writeHead(200, { "Content-Type": mimeType });
        res.end(content);
      } catch {
        res.writeHead(500);
        res.end("Internal Server Error");
      }
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        // Try next port
        server.listen(port + 1);
      } else {
        rejectPromise(err);
      }
    });

    server.listen(port, () => {
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      const url = `http://localhost:${actualPort}?wsPort=${wsPort}&httpPort=${httpPort}`;

      resolvePromise({
        url,
        stop: async () => {
          return new Promise((resolve) => {
            server.close(() => resolve());
          });
        },
      });
    });
  });
}

/**
 * Start the Vite dev server for the devtools UI (development mode).
 */
async function startViteDevServer(
  uiRoot: string,
  port: number,
  wsPort: number,
  httpPort: number,
): Promise<ViteServerResult> {
  const server: ViteDevServer = await createServer({
    root: uiRoot,
    plugins: [react(), tailwindcss()],
    server: {
      port,
      strictPort: false,
      open: false,
    },
    // Pass the WebSocket and HTTP ports to the UI via env
    define: {
      __DEVTOOLS_WS_PORT__: JSON.stringify(wsPort),
      __DEVTOOLS_HTTP_PORT__: JSON.stringify(httpPort),
    },
    // Suppress Vite's own logging since we have our own logger
    logLevel: "silent",
    // Path alias for shadcn imports
    resolve: {
      alias: {
        "@": uiRoot,
      },
    },
  });

  await server.listen();

  const address = server.httpServer?.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  const url = `http://localhost:${actualPort}`;

  return {
    url,
    stop: async () => {
      await server.close();
    },
  };
}

/**
 * Start the Vite dev server for the devtools UI.
 * In production (pre-built UI exists), serves static files.
 * In development (source UI), runs Vite dev server with HMR.
 */
export async function startViteServer(
  wsPort: number,
  port: number = DEFAULT_PORT,
  httpPort: number = 5175,
): Promise<ViteServerResult> {
  const { path: uiPath, isPrebuilt } = getUIPath();

  if (isPrebuilt) {
    // Production: serve pre-built static files
    return startStaticServer(uiPath, port, wsPort, httpPort);
  } else {
    // Development: use Vite dev server with HMR
    return startViteDevServer(uiPath, port, wsPort, httpPort);
  }
}
