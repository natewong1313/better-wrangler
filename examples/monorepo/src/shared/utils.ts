/**
 * Shared utility functions for the monorepo example.
 * These helpers ensure consistent response formatting across all workers.
 */

import type { ApiResponse } from "./types";

/** Create a successful JSON response */
export function jsonResponse<T>(data: T, status = 200): Response {
	const body: ApiResponse<T> = {
		success: true,
		data,
		timestamp: new Date().toISOString(),
	};
	return new Response(JSON.stringify(body, null, 2), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

/** Create an error JSON response */
export function errorResponse(message: string, status = 400): Response {
	const body: ApiResponse = {
		success: false,
		error: message,
		timestamp: new Date().toISOString(),
	};
	return new Response(JSON.stringify(body, null, 2), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

/** Parse URL path parameters (simple implementation) */
export function getPathParam(pathname: string, prefix: string): string | null {
	if (!pathname.startsWith(prefix)) return null;
	const param = pathname.slice(prefix.length);
	return param || null;
}
