import { Worker, R2 } from "better-wrangler";

export const worker = Worker({
  name: "r2-storage",
  entryPoint: "./src/index.ts",
  port: 6800,
  primary: true,
  bindings: {
    BUCKET: R2({ name: "my-bucket" }),
  },
});
