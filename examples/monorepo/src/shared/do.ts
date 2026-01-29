import { DurableObject } from "cloudflare:workers";
import type { CounterState } from "./types";

/**
 * CounterDO - A shared Durable Object for maintaining distributed state.
 * This DO is accessed by multiple workers in the monorepo to demonstrate
 * how state can be shared across services.
 */
export class CounterDO extends DurableObject {
	/**
	 * Get the current counter state including metadata.
	 */
	async getState(): Promise<CounterState> {
		const count = (await this.ctx.storage.get<number>("count")) ?? 0;
		const lastUpdated =
			(await this.ctx.storage.get<string>("lastUpdated")) ??
			new Date().toISOString();
		return { count, lastUpdated };
	}

	/**
	 * Increment the counter and return the new state.
	 */
	async increment(): Promise<CounterState> {
		const count = ((await this.ctx.storage.get<number>("count")) ?? 0) + 1;
		const lastUpdated = new Date().toISOString();
		await this.ctx.storage.put("count", count);
		await this.ctx.storage.put("lastUpdated", lastUpdated);
		return { count, lastUpdated };
	}

	/**
	 * Reset the counter to zero.
	 */
	async reset(): Promise<CounterState> {
		const lastUpdated = new Date().toISOString();
		await this.ctx.storage.put("count", 0);
		await this.ctx.storage.put("lastUpdated", lastUpdated);
		return { count: 0, lastUpdated };
	}
}
