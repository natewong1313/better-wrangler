/**
 * Cloudflare API client for CI deployment tests
 *
 * Provides typed methods for managing Cloudflare resources:
 * - Workers (deploy, delete, list)
 * - KV namespaces (create, delete, list)
 * - R2 buckets (create, delete, empty, list)
 * - D1 databases (create, delete, list)
 */

export interface CloudflareResponse<T> {
	success: boolean;
	result: T;
	errors: Array<{ code: number; message: string }>;
	messages: Array<{ code: number; message: string }>;
	result_info?: {
		page: number;
		per_page: number;
		total_pages: number;
		count: number;
		total_count: number;
	};
}

export interface KVNamespace {
	id: string;
	title: string;
	supports_url_encoding: boolean;
}

export interface R2Bucket {
	name: string;
	creation_date: string;
	location?: string;
}

export interface R2Object {
	key: string;
	size: number;
	uploaded: string;
	etag: string;
}

export interface D1Database {
	uuid: string;
	name: string;
	version: string;
	num_tables: number;
	file_size: number;
	created_at: string;
}

export interface Worker {
	id: string;
	etag: string;
	handlers: string[];
	modified_on: string;
	created_on: string;
	usage_model?: string;
}

export interface WorkersSubdomain {
	subdomain: string;
}

export class CloudflareAPIError extends Error {
	constructor(
		message: string,
		public status: number,
		public errors: Array<{ code: number; message: string }>
	) {
		super(message);
		this.name = "CloudflareAPIError";
	}
}

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_PER_PAGE = 100;

export class CloudflareClient {
	private apiToken: string;
	private accountId: string;
	private baseUrl = "https://api.cloudflare.com/client/v4";

	constructor(apiToken?: string, accountId?: string) {
		this.apiToken = apiToken || process.env.CLOUDFLARE_API_TOKEN || "";
		this.accountId = accountId || process.env.CLOUDFLARE_ACCOUNT_ID || "";

		if (!this.apiToken) {
			throw new Error(
				"CLOUDFLARE_API_TOKEN is required. Set it as an environment variable or pass it to the constructor."
			);
		}
		if (!this.accountId) {
			throw new Error(
				"CLOUDFLARE_ACCOUNT_ID is required. Set it as an environment variable or pass it to the constructor."
			);
		}
	}

	private async request<T>(
		method: string,
		path: string,
		body?: unknown,
		timeoutMs: number = DEFAULT_TIMEOUT_MS
	): Promise<T> {
		const url = `${this.baseUrl}${path}`;
		const headers: Record<string, string> = {
			Authorization: `Bearer ${this.apiToken}`,
			"Content-Type": "application/json",
		};

		// Add timeout using AbortController
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutMs);

		try {
			const response = await fetch(url, {
				method,
				headers,
				body: body ? JSON.stringify(body) : undefined,
				signal: controller.signal,
			});

			clearTimeout(timeout);

			// Handle JSON parsing errors
			let data: CloudflareResponse<T>;
			try {
				data = (await response.json()) as CloudflareResponse<T>;
			} catch {
				throw new CloudflareAPIError(
					`Failed to parse API response: ${response.status} ${response.statusText}`,
					response.status,
					[]
				);
			}

			if (!data.success) {
				throw new CloudflareAPIError(
					`Cloudflare API error: ${data.errors.map((e) => e.message).join(", ")}`,
					response.status,
					data.errors
				);
			}

			return data.result;
		} catch (error) {
			clearTimeout(timeout);
			if (error instanceof CloudflareAPIError) {
				throw error;
			}
			if (error instanceof Error && error.name === "AbortError") {
				throw new CloudflareAPIError(
					`Request timed out after ${timeoutMs}ms`,
					0,
					[]
				);
			}
			throw error;
		}
	}

	/**
	 * Make a request and return the full response including pagination info
	 */
	private async requestWithInfo<T>(
		method: string,
		path: string,
		body?: unknown
	): Promise<CloudflareResponse<T>> {
		const url = `${this.baseUrl}${path}`;
		const headers: Record<string, string> = {
			Authorization: `Bearer ${this.apiToken}`,
			"Content-Type": "application/json",
		};

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

		try {
			const response = await fetch(url, {
				method,
				headers,
				body: body ? JSON.stringify(body) : undefined,
				signal: controller.signal,
			});

			clearTimeout(timeout);

			let data: CloudflareResponse<T>;
			try {
				data = (await response.json()) as CloudflareResponse<T>;
			} catch {
				throw new CloudflareAPIError(
					`Failed to parse API response: ${response.status} ${response.statusText}`,
					response.status,
					[]
				);
			}

			if (!data.success) {
				throw new CloudflareAPIError(
					`Cloudflare API error: ${data.errors.map((e) => e.message).join(", ")}`,
					response.status,
					data.errors
				);
			}

			return data;
		} catch (error) {
			clearTimeout(timeout);
			if (error instanceof CloudflareAPIError) {
				throw error;
			}
			if (error instanceof Error && error.name === "AbortError") {
				throw new CloudflareAPIError(
					`Request timed out after ${DEFAULT_TIMEOUT_MS}ms`,
					0,
					[]
				);
			}
			throw error;
		}
	}

	// Workers
	async getWorkersSubdomain(): Promise<string> {
		const result = await this.request<WorkersSubdomain>(
			"GET",
			`/accounts/${this.accountId}/workers/subdomain`
		);
		return result.subdomain;
	}

	async listWorkers(): Promise<Worker[]> {
		return this.request<Worker[]>(
			"GET",
			`/accounts/${this.accountId}/workers/scripts`
		);
	}

	async deleteWorker(scriptName: string): Promise<void> {
		await this.request<void>(
			"DELETE",
			`/accounts/${this.accountId}/workers/scripts/${scriptName}`
		);
	}

	// KV Namespaces
	async createKVNamespace(title: string): Promise<KVNamespace> {
		return this.request<KVNamespace>(
			"POST",
			`/accounts/${this.accountId}/storage/kv/namespaces`,
			{ title }
		);
	}

	/**
	 * List all KV namespaces with pagination support
	 */
	async listKVNamespaces(): Promise<KVNamespace[]> {
		const allNamespaces: KVNamespace[] = [];
		let page = 1;
		let hasMore = true;

		while (hasMore) {
			const response = await this.requestWithInfo<KVNamespace[]>(
				"GET",
				`/accounts/${this.accountId}/storage/kv/namespaces?page=${page}&per_page=${DEFAULT_PER_PAGE}`
			);
			allNamespaces.push(...response.result);

			if (response.result_info) {
				hasMore = response.result_info.page < response.result_info.total_pages;
			} else {
				hasMore = false;
			}
			page++;
		}

		return allNamespaces;
	}

	async deleteKVNamespace(namespaceId: string): Promise<void> {
		await this.request<void>(
			"DELETE",
			`/accounts/${this.accountId}/storage/kv/namespaces/${namespaceId}`
		);
	}

	// R2 Buckets
	async createR2Bucket(name: string): Promise<R2Bucket> {
		return this.request<R2Bucket>(
			"POST",
			`/accounts/${this.accountId}/r2/buckets`,
			{ name }
		);
	}

	async listR2Buckets(): Promise<R2Bucket[]> {
		const result = await this.request<{ buckets: R2Bucket[] }>(
			"GET",
			`/accounts/${this.accountId}/r2/buckets`
		);
		return result.buckets;
	}

	async deleteR2Bucket(bucketName: string): Promise<void> {
		await this.request<void>(
			"DELETE",
			`/accounts/${this.accountId}/r2/buckets/${bucketName}`
		);
	}

	async listR2Objects(
		bucketName: string
	): Promise<{ objects: R2Object[]; truncated: boolean }> {
		const result = await this.request<{
			objects: R2Object[];
			truncated: boolean;
		}>("GET", `/accounts/${this.accountId}/r2/buckets/${bucketName}/objects`);
		return result;
	}

	async deleteR2Object(bucketName: string, key: string): Promise<void> {
		await this.request<void>(
			"DELETE",
			`/accounts/${this.accountId}/r2/buckets/${bucketName}/objects/${encodeURIComponent(key)}`
		);
	}

	/**
	 * Empty an R2 bucket by deleting all objects
	 * @param maxIterations Maximum number of listing iterations to prevent infinite loops
	 */
	async emptyR2Bucket(bucketName: string, maxIterations = 100): Promise<void> {
		let truncated = true;
		let iterations = 0;

		while (truncated && iterations < maxIterations) {
			const result = await this.listR2Objects(bucketName);
			for (const obj of result.objects) {
				await this.deleteR2Object(bucketName, obj.key);
			}
			truncated = result.truncated;
			iterations++;
		}

		if (truncated) {
			throw new Error(
				`Failed to empty bucket ${bucketName} after ${maxIterations} iterations`
			);
		}
	}

	// D1 Databases
	async createD1Database(name: string): Promise<D1Database> {
		return this.request<D1Database>(
			"POST",
			`/accounts/${this.accountId}/d1/database`,
			{ name }
		);
	}

	/**
	 * List all D1 databases with pagination support
	 */
	async listD1Databases(): Promise<D1Database[]> {
		const allDatabases: D1Database[] = [];
		let page = 1;
		let hasMore = true;

		while (hasMore) {
			const response = await this.requestWithInfo<D1Database[]>(
				"GET",
				`/accounts/${this.accountId}/d1/database?page=${page}&per_page=${DEFAULT_PER_PAGE}`
			);
			allDatabases.push(...response.result);

			if (response.result_info) {
				hasMore = response.result_info.page < response.result_info.total_pages;
			} else {
				hasMore = false;
			}
			page++;
		}

		return allDatabases;
	}

	async deleteD1Database(databaseId: string): Promise<void> {
		await this.request<void>(
			"DELETE",
			`/accounts/${this.accountId}/d1/database/${databaseId}`
		);
	}

	// Utility method to get account ID (for debugging)
	getAccountId(): string {
		return this.accountId;
	}
}

// Export a factory function for convenience
export function createCloudflareClient(
	apiToken?: string,
	accountId?: string
): CloudflareClient {
	return new CloudflareClient(apiToken, accountId);
}
