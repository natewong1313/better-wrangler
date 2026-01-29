import { Worker, D1, DurableObject } from "better-wrangler";
import type { MyDurableObject } from "./src/shared/do";

const sharedDO = DurableObject<typeof MyDurableObject>({
  name: "DO",
  className: "MyDurableObject",
  classPath: "./src/shared/do.ts",
});

export const worker1 = Worker({
  name: "worker-1",
  entryPoint: "./src/worker-1/index.ts",
  port: 6700,
  primary: true,
  bindings: {
    DB: D1({ name: "my-db" }),
    DO: sharedDO,
  },
});

export const worker2 = Worker({
  name: "worker-2",
  entryPoint: "./src/worker-2/index.ts",
  port: 6701,
  bindings: {
    DO: worker1.bindings.DO,
  },
});
