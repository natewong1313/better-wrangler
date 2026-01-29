/**
 * Mock for cloudflare:workers module
 * cli needs this for importing the config file outside of wranglers runtime
 */

export class DurableObject<Env = unknown> {
  protected ctx: unknown;
  protected env: Env;

  constructor(ctx: unknown, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }
}

export const Rpc = {
  DurableObjectBranded: Symbol("DurableObjectBranded"),
};
