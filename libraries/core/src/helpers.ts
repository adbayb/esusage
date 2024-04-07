import { spawn } from "child_process";

/**
 * Execute an external command.
 * @param command - The command to execute.
 * @param options - Options including current working directory configuration.
 * @param options.cwd - Configure the current working directory.
 * @returns The output (either the command output or error).
 * @example
 * exec("ls");
 */
export const exec = async (command: string, options: { cwd?: string } = {}) => {
	return new Promise<string>((success, error) => {
		let stdout = "";
		let stderr = "";
		const [bin, ...args] = command.split(" ") as [string, ...string[]];

		const childProcess = spawn(bin, args, {
			cwd: options.cwd,
			shell: true,
			stdio: "pipe",
		});

		childProcess.stdout.on("data", (chunk) => {
			stdout += chunk;
		});

		childProcess.stderr.on("data", (chunk) => {
			stderr += chunk;
		});

		childProcess.on("close", (exitCode) => {
			if (exitCode !== 0) {
				const output = `${stderr}${stdout}`;

				error(output.trim());
			} else {
				success(stdout.trim());
			}
		});
	});
};
