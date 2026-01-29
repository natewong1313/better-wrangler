import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import react from "@astrojs/react";

export default defineConfig({
  integrations: [
    starlight({
      title: "better-wrangler",
      description:
        "TypeScript-first configuration for Cloudflare Workers monorepos",
      social: {
        github: "https://github.com/natewong1313/better-wrangler",
      },
      sidebar: [
        {
          label: "Getting Started",
          items: [
            { label: "Installation", slug: "getting-started/installation" },
            { label: "Quick Start", slug: "getting-started/quick-start" },
            { label: "CLI Commands", slug: "getting-started/cli-commands" },
          ],
        },
        {
          label: "Configuration",
          items: [
            { label: "Overview", slug: "configuration/overview" },
            { label: "Worker Options", slug: "configuration/worker" },
          ],
        },
        {
          label: "Bindings",
          items: [
            { label: "Overview", slug: "bindings/overview" },
            { label: "D1 Database", slug: "bindings/d1" },
            { label: "R2 Storage", slug: "bindings/r2" },
            { label: "KV Namespace", slug: "bindings/kv" },
            { label: "Durable Objects", slug: "bindings/durable-objects" },
            { label: "Queues", slug: "bindings/queues" },
          ],
        },
        {
          label: "Guides",
          items: [
            { label: "Monorepo Setup", slug: "guides/monorepo-setup" },
            { label: "Automatic Migrations", slug: "guides/migrations" },
            { label: "Type Inference", slug: "guides/type-inference" },
          ],
        },
      ],
    }),
    react(),
  ],
});
