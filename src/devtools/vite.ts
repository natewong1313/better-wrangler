import { createServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const DEFAULT_PORT = 5173;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export type ViteServerResult = {
  url: string;
  stop: () => Promise<void>;
};

/**
 * Start the Vite dev server for the devtools UI.
 */
export async function startViteServer(
  wsPort: number,
  port: number = DEFAULT_PORT,
): Promise<ViteServerResult> {
  const uiRoot = resolve(__dirname, "ui");

  const server: ViteDevServer = await createServer({
    root: uiRoot,
    plugins: [react(), tailwindcss()],
    server: {
      port,
      strictPort: false,
      open: false,
    },
    // Pass the WebSocket port to the UI via env
    define: {
      __DEVTOOLS_WS_PORT__: JSON.stringify(wsPort),
    },
    // Suppress Vite's own logging since we have our own logger
    logLevel: "silent",
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
