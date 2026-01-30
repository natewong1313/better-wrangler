/**
 * Wait for a deployed worker to become reachable
 *
 * After deploying a worker, there can be a short delay before it's fully
 * available. This utility polls the worker URL until it responds.
 */

export interface WaitOptions {
	/** Maximum time to wait in milliseconds (default: 60000 = 1 minute) */
	timeout?: number;
	/** Interval between checks in milliseconds (default: 2000 = 2 seconds) */
	interval?: number;
	/** Expected status code (default: any 2xx or 404 indicates worker is up) */
	expectedStatus?: number | number[];
}

export interface WaitResult {
	/** Whether the worker became reachable within the timeout */
	success: boolean;
	/** Time taken in milliseconds */
	duration: number;
	/** Final response status code, if any */
	status?: number;
	/** Error message if failed */
	error?: string;
}

/**
 * Wait for a worker URL to become reachable
 */
export async function waitForWorker(
	url: string,
	options: WaitOptions = {}
): Promise<WaitResult> {
	const { timeout = 60000, interval = 2000, expectedStatus } = options;

	const startTime = Date.now();
	const deadline = startTime + timeout;

	const isExpectedStatus = (status: number): boolean => {
		if (expectedStatus === undefined) {
			// By default, any response (even 404) means the worker is deployed
			// We mainly want to avoid connection errors and 502/503
			return status < 500;
		}
		if (Array.isArray(expectedStatus)) {
			return expectedStatus.includes(status);
		}
		return status === expectedStatus;
	};

	while (Date.now() < deadline) {
		try {
			const controller = new AbortController();
			const fetchTimeout = setTimeout(() => controller.abort(), 10000);

			const response = await fetch(url, {
				method: "GET",
				signal: controller.signal,
				headers: {
					"User-Agent": "better-wrangler-ci-tests",
				},
			});

			clearTimeout(fetchTimeout);

			if (isExpectedStatus(response.status)) {
				return {
					success: true,
					duration: Date.now() - startTime,
					status: response.status,
				};
			}

			console.log(
				`  Worker at ${url} returned ${response.status}, waiting...`
			);
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);

			// Don't log every failed attempt, just wait
			if (errorMessage.includes("ENOTFOUND") || errorMessage.includes("DNS")) {
				// DNS not propagated yet, this is expected
			} else if (
				errorMessage.includes("abort") ||
				errorMessage.includes("timeout")
			) {
				// Request timed out, this is expected during deployment
			} else {
				console.log(`  Waiting for worker at ${url}: ${errorMessage}`);
			}
		}

		// Wait before next attempt
		await sleep(interval);
	}

	return {
		success: false,
		duration: Date.now() - startTime,
		error: `Timed out after ${timeout}ms waiting for worker at ${url}`,
	};
}

/**
 * Wait for multiple workers to become reachable
 */
export async function waitForWorkers(
	workers: Array<{ name: string; url: string }>,
	options: WaitOptions = {}
): Promise<Map<string, WaitResult>> {
	const results = new Map<string, WaitResult>();

	// Wait for workers in parallel
	const promises = workers.map(async (worker) => {
		console.log(`Waiting for worker ${worker.name} at ${worker.url}...`);
		const result = await waitForWorker(worker.url, options);
		results.set(worker.name, result);

		if (result.success) {
			console.log(
				`  Worker ${worker.name} is ready (${result.duration}ms, status: ${result.status})`
			);
		} else {
			console.error(`  Worker ${worker.name} failed: ${result.error}`);
		}
	});

	await Promise.all(promises);
	return results;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
