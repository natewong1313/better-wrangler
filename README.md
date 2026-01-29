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
| `vars` | `Record<string, string>` | Environment variables |
| `triggers` | `{ crons?: string[] }` | Scheduled triggers (cron expressions) |
| `compatibility` | `{ date?: string, flags?: string[] }` | Compatibility settings |

#### Environment Variables

```typescript
Worker({
  name: "my-worker",
  entryPoint: "./src/index.ts",
  vars: {
    API_URL: "https://api.example.com",
    ENVIRONMENT: "production",
  },
})
```

Variables are merged into the `Env` type, giving you full type inference:

```typescript
async fetch(request: Request, env: typeof worker.Env) {
  env.API_URL  // string - fully typed!
}
```

#### Scheduled Triggers

```typescript
Worker({
  name: "my-worker",
  entryPoint: "./src/index.ts",
  triggers: {
    crons: ["0 * * * *", "0 0 * * *"],  // hourly and daily
  },
})
```

#### Compatibility Settings

```typescript
Worker({
  name: "my-worker",
  entryPoint: "./src/index.ts",
  compatibility: {
    date: "2024-09-23",
    flags: ["nodejs_compat_v2"],
  },
})
```

### `D1(options)`

Creates a D1 database binding.

```typescript
// Local development (name only)
D1({ name: "my-database" })

// Production deployment (with database ID)
D1({ 
  name: "my-database",
  id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
})
```

### `R2(options)`

Creates an R2 bucket binding.

```typescript
R2({ name: "my-bucket" })
```

### `KV(options)`

Creates a KV namespace binding.

```typescript
// Local development (name only)
KV({ name: "my-kv-namespace" })

// Production deployment (with namespace ID)
KV({ 
  name: "my-kv-namespace",
  id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  preview_id: "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy"  // optional
})
```

### `DurableObject(options)`

Creates a Durable Object binding.

```typescript
DurableObject({
  name: "MY_DO",           // Binding name
  className: "MyDO",       // Export class name
  classPath: "./src/do.ts" // Path to DO implementation
  storage: "sqlite",       // Optional: "sqlite" (default, 10GB) or "kv" (legacy, 128KB)
})
```

Cross-worker Durable Objects are automatically configured when you reference another worker's binding.

#### Automatic Migration Management

Durable Object migrations are managed automatically via a `bw.migrations.json` state file (should be committed to git). You never need to manually configure migration tags or track class changes.

### `QueueProducer(options)`

Creates a queue producer binding for sending messages to a Cloudflare Queue.

```typescript
// Basic producer
QueueProducer({ 
  name: "ORDER_QUEUE",  // Binding name (env.ORDER_QUEUE)
  queue: "order-processing"  // Queue name
})

// With delivery delay (messages delayed before becoming visible)
QueueProducer({ 
  name: "ORDER_QUEUE",
  queue: "order-processing",
  deliveryDelay: 60  // 60 seconds delay (max 43200 = 12 hours)
})

// Reference a QueueConsumer for type-safe cross-worker queues
const orderConsumer = QueueConsumer({ queue: "order-processing" });
QueueProducer({ name: "ORDER_QUEUE", queue: orderConsumer })
```

### `QueueConsumer(options)`

Creates a queue consumer binding for receiving messages from a Cloudflare Queue.

```typescript
// Basic push consumer (Worker handler receives messages)
QueueConsumer({ queue: "order-processing" })

// With full configuration
QueueConsumer({
  queue: "order-processing",
  maxBatchSize: 50,        // 1-100 messages per batch (default 10)
  maxBatchTimeout: 30,     // 0-60 seconds to wait for batch (default 5)
  maxRetries: 5,           // Retry attempts before DLQ (default 3)
  deadLetterQueue: "order-dlq",  // Failed messages go here
  retryDelay: 60,          // Seconds before retry
})

// HTTP pull consumer (fetch messages via HTTP API)
QueueConsumer({
  queue: "pull-queue",
  type: "http_pull"
})
```

#### Cross-Worker Queues Example

```typescript
import { Worker, QueueProducer, QueueConsumer } from "better-wrangler";

// Define consumer (can be referenced by producer)
const orderQueue = QueueConsumer({
  queue: "order-processing",
  maxRetries: 5,
  deadLetterQueue: "order-dlq",
});

// API worker produces messages
export const apiWorker = Worker({
  name: "api",
  entryPoint: "./src/api.ts",
  bindings: {
    ORDER_QUEUE: QueueProducer({ name: "ORDER_QUEUE", queue: orderQueue }),
  },
});

// Processor worker consumes messages
export const processorWorker = Worker({
  name: "processor",
  entryPoint: "./src/processor.ts",
  bindings: {
    orderQueue,  // Consumer binding
  },
});
```

| Action | User Effort |
|--------|-------------|
| Add new DO | Zero config - auto-detected |
| Rename DO (same file) | Zero config - auto-detected via classPath |
| Rename DO (different file) | Add `_renamedFrom: "OldClassName"` to binding |
| Delete DO | Pass `deletedDurableObjects: ["ClassName"]` to generate options |

**Rename example** (when file path also changes):
```typescript
DurableObject({
  name: "MY_DO",
  className: "MyDOV2",           // New class name
  classPath: "./src/new-do.ts", // New file path
  _renamedFrom: "MyDO",         // Old class name
})
```

The system will fail with a helpful error if it can't determine whether a removed class was renamed or deleted, ensuring you never accidentally lose data.

## Cloudflare Bindings Support

| Binding | Status |
|---------|--------|
| D1 | ✅ Supported |
| Durable Objects | ✅ Supported |
| R2 | ✅ Supported |
| KV | ✅ Supported |
| Queues | ✅ Supported |
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
