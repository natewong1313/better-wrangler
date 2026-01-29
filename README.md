# better-wrangler

> Experimental - This tool is in early development and may change without notice.

TypeScript-first configuration for Cloudflare Workers monorepos. Define your workers and bindings in TypeScript with full type inference.

## Features

- **Type-safe bindings** - Full TypeScript inference for your worker environment
- **Auto-generated configs** - Generates `wrangler.jsonc` from `bw.config.ts`
- **Monorepo support** - Cross-worker Durable Objects with automatic migrations
- **Unified dev server** - Miniflare-based, runs all workers in parallel

## Quick Start

```bash
npm install better-wrangler
```

```typescript
// bw.config.ts
import { Worker, D1, DurableObject } from "better-wrangler";

export const api = Worker({
  name: "api",
  entryPoint: "./src/api/index.ts",
  bindings: {
    DB: D1({ name: "my-database" }),
  },
});
```

```typescript
// src/api/index.ts
import { api } from "../../bw.config";

export default {
  async fetch(request: Request, env: typeof api.Env) {
    // env.DB is fully typed!
    const result = await env.DB.prepare("SELECT * FROM users").all();
    return Response.json(result);
  },
};
```

## Commands

```bash
bw dev          # Start dev server (all workers)
bw dev api      # Start specific worker(s)
bw sync         # Generate wrangler.jsonc files
```

## Documentation

Full documentation available at **[better-wrangler-docs.pages.dev](https://better-wrangler-docs.pages.dev)**

## Supported Bindings

| Binding | Status |
|---------|--------|
| D1, KV, R2 | Supported |
| Durable Objects | Supported |
| Queues | Supported |
| Service Bindings | Coming soon |
| Workers AI, Vectorize | Coming soon |

## License

MIT
