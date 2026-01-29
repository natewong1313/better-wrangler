/**
 * Shared types for the monorepo example.
 * These types are used across multiple workers for consistent API responses.
 */

/** Standard API response wrapper */
export interface ApiResponse<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
	timestamp: string;
}

/** Counter state from the Durable Object */
export interface CounterState {
	count: number;
	lastUpdated: string;
}

/** Key-value entry */
export interface KVEntry {
	key: string;
	value: string;
}

/** R2 object metadata */
export interface R2ObjectInfo {
	key: string;
	size: number;
	etag: string;
	uploaded: string;
}
