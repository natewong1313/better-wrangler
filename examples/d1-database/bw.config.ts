import { Worker, D1 } from "better-wrangler";

export const worker = Worker({
  name: "d1-database-example",
  entryPoint: "./src/index.ts",
  port: 8789,
  bindings: {
    DB: D1({ name: "tasks-db" }),
  },
});
