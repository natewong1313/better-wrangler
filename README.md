# better-wrangler

> Experimental - This tool is in early development and may change without notice.

TypeScript-first configuration for Cloudflare Workers monorepos. Inspired heavily by [alchemy](https://github.com/alchemy-run/alchemy) but intended to be a more lightweight and opinionated version

## Overview

better-wrangler provides a type-safe way to configure multiple Cloudflare Workers in a monorepo. Define your workers and bindings in TypeScript, and let the tool generate `wrangler.jsonc` configs automatically.

- Type-safe bindings configuration via `bw.config.ts`
- Auto-generates `wrangler.jsonc` from TypeScript definitions
- Cross-worker Durable Object support with automatic migrations
- Miniflare-based dev server running all workers in parallel
- Full type inference for worker environment bindings

## Installation

*coming soon*

```bash
npm install better-wrangler
```

## Quick Start

Create a `bw.config.ts` in your project root:

```typescript
import { Worker, D1, DurableObject } from "better-wrangler";

// Define a shared Durable Object
const chatDO = DurableObject<typeof ChatDurableObject>({
  name: "CHAT_DO",
  className: "ChatDurableObject",
  classPath: "./src/chat-durable-object.ts",
});

// Define your workers
export const worker = Worker({
  name: "worker",
  entryPoint: "./src/worker/index.ts",
  port: 6767,
  bindings: {
    DO: chatDO,
    DB: D1({ name: "my-database" }),
  },
});

```

Use typed bindings in your worker:

```typescript
import { worker1 } from "../../bw.config";

export default {
  async fetch(request: Request, env: typeof worker1.Env) {
    // env.DO and env.DB are fully typed
    const id = env.DO.idFromName("my-instance");
    const stub = env.DO.get(id);

    const result = await env.DB.prepare("SELECT * FROM users").all();
    return new Response(JSON.stringify(result));
  },
};
```

## Commands

### `bw dev`

Syncs configuration and starts all workers in development mode.

```bash
# Run with Miniflare (default) - all workers in one process
bw dev

# Run specific workers only
bw dev worker-1 worker-2

# Legacy mode - uses wrangler instead of miniflare
bw dev --legacy
```

### `bw sync`

Generates `wrangler.jsonc` files from your `bw.config.ts` without starting the dev server.

```bash
bw sync
```

## Configuration API

### `Worker(options)`

Defines a worker configuration.

| Option | Type | Description |
|--------|------|-------------|
| `name` | `string` | Worker name (used in wrangler config) |
| `entryPoint` | `string` | Path to worker entry file |
| `port` | `number` | Dev server port |
| `primary` | `boolean` | Mark as primary worker (optional) |
| `bindings` | `object` | Binding definitions |

### `D1(options)`

Creates a D1 database binding.

```typescript
D1({ name: "my-database" })
```

### `DurableObject(options)`

Creates a Durable Object binding.

```typescript
DurableObject({
  name: "MY_DO",           // Binding name
  className: "MyDO",       // Export class name
  classPath: "./src/do.ts" // Path to DO implementation
})
```

Cross-worker Durable Objects are automatically configured when you reference another worker's binding.

## Cloudflare Bindings Support

| Binding | Status |
|---------|--------|
| D1 | ✅ Supported |
| Durable Objects | ✅ Supported |
| KV | ❌ Not yet supported |
| R2 | ❌ Not yet supported |
| Queues | ❌ Not yet supported |
| Hyperdrive | ❌ Not yet supported |
| Workers AI | ❌ Not yet supported |
| Vectorize | ❌ Not yet supported |
| Service Bindings | ❌ Not yet supported |
| Analytics Engine | ❌ Not yet supported |
| Browser Rendering | ❌ Not yet supported |
| mTLS Certificates | ❌ Not yet supported |
| Rate Limiting | ❌ Not yet supported |
| Secrets | ❌ Not yet supported |
| Pipelines | ❌ Not yet supported |

## License

MIT
