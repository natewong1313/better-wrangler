import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: __dirname,
  build: {
    outDir: resolve(__dirname, "../../../dist/devtools-ui"),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@": __dirname,
    },
  },
});
