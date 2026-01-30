import { Worker, D1 } from "better-wrangler";

export const worker = Worker({
  name: "drizzle-orm-example",
  entryPoint: "./src/index.ts",
  port: 8790,
  bindings: {
    DB: D1({ name: "drizzle-db", migrationsDir: "./drizzle/migrations" }),
  },
});
