/**
 * HTTP client with retries for deployment tests
 *
 * Provides a fetch wrapper with automatic retries and timeout handling,
 * which is useful for testing deployed workers that might have transient issues.
 */

export interface HttpClientOptions {
	/** Base URL to prepend to all requests */
	baseUrl?: string;
	/** Default timeout in milliseconds (default: 10000) */
	timeout?: number;
	/** Number of retries for failed requests (default: 2) */
	retries?: number;
	/** Delay between retries in milliseconds (default: 1000) */
	retryDelay?: number;
}

export interface RequestOptions {
	method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
	headers?: Record<string, string>;
	body?: string | object;
	timeout?: number;
	retries?: number;
}

export class HttpClient {
	private baseUrl: string;
	private defaultTimeout: number;
	private defaultRetries: number;
	private retryDelay: number;

	constructor(options: HttpClientOptions = {}) {
		this.baseUrl = options.baseUrl || "";
		this.defaultTimeout = options.timeout || 10000;
		this.defaultRetries = options.retries || 2;
		this.retryDelay = options.retryDelay || 1000;
	}

	async request(
		path: string,
		options: RequestOptions = {}
	): Promise<Response> {
		const url = this.baseUrl ? `${this.baseUrl}${path}` : path;
		const method = options.method || "GET";
		const timeout = options.timeout ?? this.defaultTimeout;
		const retries = options.retries ?? this.defaultRetries;

		const headers: Record<string, string> = {
			"User-Agent": "better-wrangler-deployment-tests",
			...options.headers,
		};

		let body: string | undefined;
		if (options.body) {
			if (typeof options.body === "object") {
				body = JSON.stringify(options.body);
				headers["Content-Type"] = headers["Content-Type"] || "application/json";
			} else {
				body = options.body;
			}
		}

		let lastError: Error | undefined;

		for (let attempt = 0; attempt <= retries; attempt++) {
			try {
				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), timeout);

				const response = await fetch(url, {
					method,
					headers,
					body,
					signal: controller.signal,
				});

				clearTimeout(timeoutId);
				return response;
			} catch (error) {
				lastError = error as Error;

				// Don't retry if it was aborted intentionally
				if (lastError.name === "AbortError") {
					lastError = new Error(`Request timed out after ${timeout}ms`);
				}

				// Don't retry on the last attempt
				if (attempt < retries) {
					console.log(
						`  Request to ${path} failed (attempt ${attempt + 1}/${retries + 1}): ${lastError.message}`
					);
					await sleep(this.retryDelay);
				}
			}
		}

		throw lastError || new Error(`Request failed after ${retries + 1} attempts`);
	}

	async get(path: string, options?: Omit<RequestOptions, "method">): Promise<Response> {
		return this.request(path, { ...options, method: "GET" });
	}

	async post(path: string, options?: Omit<RequestOptions, "method">): Promise<Response> {
		return this.request(path, { ...options, method: "POST" });
	}

	async put(path: string, options?: Omit<RequestOptions, "method">): Promise<Response> {
		return this.request(path, { ...options, method: "PUT" });
	}

	async delete(path: string, options?: Omit<RequestOptions, "method">): Promise<Response> {
		return this.request(path, { ...options, method: "DELETE" });
	}

	async patch(path: string, options?: Omit<RequestOptions, "method">): Promise<Response> {
		return this.request(path, { ...options, method: "PATCH" });
	}
}

/**
 * Create an HTTP client for a specific worker URL
 */
export function createHttpClient(baseUrl: string): HttpClient {
	return new HttpClient({ baseUrl });
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
