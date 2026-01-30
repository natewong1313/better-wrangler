import { Worker, R2, KV, DurableObject } from "better-wrangler";
import { Counter } from "./src/counter-do";

const counterDO = DurableObject<typeof Counter>({
  name: "counter",
  className: "Counter",
  classPath: "./src/counter-do.ts",
});

export const worker = Worker({
  name: "kitchen-sink",
  entryPoint: "./src/index.ts",
  port: 8791,
  bindings: {
    BUCKET: R2({ name: "kitchen-sink-bucket" }),
    CACHE: KV({ name: "kitchen-sink-cache" }),
    COUNTER: counterDO,
  },
});
