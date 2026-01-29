import { worker2 } from "../../bw.config";

export default {
  async fetch(req: Request, env: typeof worker2.Env): Promise<Response> {
    const stub = env.DO.getByName("test");
    const count = await stub.getCount();
    return new Response(`Worker 2 (ilskdjfshared DO) - count: ${count}`);
  },
};
