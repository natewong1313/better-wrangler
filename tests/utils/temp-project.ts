import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const tempDirs: string[] = [];

/**
 * Gets the absolute path to the better-wrangler source directory
 */
export function getSourcePath(): string {
	return path.resolve(__dirname, "../../src");
}

export interface TempProjectOptions {
	config?: string;
	workers?: Record<string, string>;
}

/**
 * Creates a temporary project directory with optional config and worker files
 */
export async function createTempProject(
	options: TempProjectOptions = {}
): Promise<string> {
	const tempDir = await fs.promises.mkdtemp(
		path.join(os.tmpdir(), "bw-test-")
	);
	tempDirs.push(tempDir);

	if (options.config) {
		await fs.promises.writeFile(
			path.join(tempDir, "bw.config.ts"),
			options.config
		);
	}

	if (options.workers) {
		const srcDir = path.join(tempDir, "src");
		await fs.promises.mkdir(srcDir, { recursive: true });

		for (const [name, content] of Object.entries(options.workers)) {
			const workerDir = path.join(srcDir, name);
			await fs.promises.mkdir(workerDir, { recursive: true });
			await fs.promises.writeFile(path.join(workerDir, "index.ts"), content);
		}
	}

	return tempDir;
}

/**
 * Cleans up all temporary project directories created during tests
 */
export async function cleanupTempProjects(): Promise<void> {
	for (const dir of tempDirs) {
		try {
			await fs.promises.rm(dir, { recursive: true, force: true });
		} catch {
			// Ignore errors during cleanup
		}
	}
	tempDirs.length = 0;
}

/**
 * Reads a file from the temp project
 */
export async function readTempFile(
	tempDir: string,
	relativePath: string
): Promise<string> {
	return fs.promises.readFile(path.join(tempDir, relativePath), "utf-8");
}

/**
 * Checks if a file exists in the temp project
 */
export async function tempFileExists(
	tempDir: string,
	relativePath: string
): Promise<boolean> {
	try {
		await fs.promises.access(path.join(tempDir, relativePath));
		return true;
	} catch {
		return false;
	}
}
