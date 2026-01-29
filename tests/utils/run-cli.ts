import { spawn, type ChildProcess } from "node:child_process";
import * as path from "node:path";

export interface CLIResult {
	exitCode: number | null;
	stdout: string;
	stderr: string;
}

export interface CLIHandle {
	process: ChildProcess;
	stdout: string;
	stderr: string;
	waitForExit: () => Promise<CLIResult>;
	waitForOutput: (pattern: RegExp, timeout?: number) => Promise<void>;
	kill: () => void;
}

/**
 * Runs the CLI with the given arguments and returns the result
 */
export async function runCLI(
	args: string[],
	options: { cwd?: string; timeout?: number } = {}
): Promise<CLIResult> {
	const { cwd = process.cwd(), timeout = 30000 } = options;

	const cliPath = path.resolve(__dirname, "../../src/cli.ts");

	return new Promise((resolve, reject) => {
		const proc = spawn("bun", ["run", cliPath, ...args], {
			cwd,
			stdio: ["pipe", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";

		proc.stdout?.on("data", (data) => {
			stdout += data.toString();
		});

		proc.stderr?.on("data", (data) => {
			stderr += data.toString();
		});

		const timer = setTimeout(() => {
			proc.kill();
			reject(new Error(`CLI timed out after ${timeout}ms`));
		}, timeout);

		proc.on("close", (exitCode) => {
			clearTimeout(timer);
			resolve({ exitCode, stdout, stderr });
		});

		proc.on("error", (err) => {
			clearTimeout(timer);
			reject(err);
		});
	});
}

/**
 * Starts the CLI and returns a handle for interacting with it
 * Useful for long-running processes like `bw dev`
 */
export function startCLI(
	args: string[],
	options: { cwd?: string } = {}
): CLIHandle {
	const { cwd = process.cwd() } = options;

	const cliPath = path.resolve(__dirname, "../../src/cli.ts");

	const proc = spawn("bun", ["run", cliPath, ...args], {
		cwd,
		stdio: ["pipe", "pipe", "pipe"],
	});

	let stdout = "";
	let stderr = "";

	proc.stdout?.on("data", (data) => {
		stdout += data.toString();
	});

	proc.stderr?.on("data", (data) => {
		stderr += data.toString();
	});

	const handle: CLIHandle = {
		process: proc,
		get stdout() {
			return stdout;
		},
		get stderr() {
			return stderr;
		},
		waitForExit: () =>
			new Promise((resolve) => {
				proc.on("close", (exitCode) => {
					resolve({ exitCode, stdout, stderr });
				});
			}),
		waitForOutput: (pattern: RegExp, timeout = 30000) =>
			new Promise((resolve, reject) => {
				const checkOutput = () => {
					if (pattern.test(stdout) || pattern.test(stderr)) {
						resolve();
						return true;
					}
					return false;
				};

				if (checkOutput()) return;

				const timer = setTimeout(() => {
					reject(
						new Error(
							`Timed out waiting for output matching ${pattern}. stdout: ${stdout}, stderr: ${stderr}`
						)
					);
				}, timeout);

				const onData = () => {
					if (checkOutput()) {
						clearTimeout(timer);
						proc.stdout?.off("data", onData);
						proc.stderr?.off("data", onData);
					}
				};

				proc.stdout?.on("data", onData);
				proc.stderr?.on("data", onData);
			}),
		kill: () => {
			proc.kill();
		},
	};

	return handle;
}
