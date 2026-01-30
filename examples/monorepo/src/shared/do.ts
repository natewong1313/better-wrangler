import { DurableObject } from "cloudflare:workers";

export class MyDurableObject extends DurableObject {
  async sayHello(): Promise<string> {
    return "Hello from Durable Object!";
  }

  async getCount(): Promise<number> {
    console.log("DurableObject");
    const stored = (await this.ctx.storage.get<number>("count")) ?? 0;
    await this.ctx.storage.put("count", stored + 1);
    return stored + 1;
  }
}
