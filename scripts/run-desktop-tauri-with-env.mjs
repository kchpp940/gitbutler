import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { spawn } from "node:child_process";

const mode = process.argv[2];
const command = process.argv[3];
const commandArgs = process.argv.slice(4);

if (!mode || !command) {
	console.error("Usage: node scripts/run-desktop-tauri-with-env.mjs <mode> <command> [args...]");
	process.exit(1);
}

const repoRoot = process.cwd();
const desktopDir = resolve(repoRoot, "apps/desktop");
const envFiles = [
	resolve(desktopDir, ".env"),
	resolve(desktopDir, ".env.local"),
	resolve(desktopDir, `.env.${mode}`),
	resolve(desktopDir, `.env.${mode}.local`),
];

const mergedEnv = { ...process.env };

for (const filePath of envFiles) {
	if (!existsSync(filePath)) continue;
	const fileEnv = parseDotEnv(readFileSync(filePath, "utf8"));
	for (const [key, value] of Object.entries(fileEnv)) {
		if (process.env[key] === undefined) {
			mergedEnv[key] = value;
		}
	}
}

try {
	const specPath = findSpecFile(repoRoot);
	const spec = JSON.parse(readFileSync(specPath, "utf-8"));

	const channelMap = {
		development: "development",
		dev: "dev",
		nightly: "nightly",
		production: "production",
		release: "release",
		test: "test",
	};
	const channel = channelMap[mode] || "development";
	const channelConfig = spec.channels[channel] || spec.channels.dev;
	const profile = channelConfig?.profile || "debug";
	const cargoTargetDir = channelConfig?.cargoTargetDir || "target/tauri";

	mergedEnv.CHANNEL = channel;
	mergedEnv.PROFILE = profile;
	mergedEnv.CARGO_TARGET_DIR = resolve(repoRoot, cargoTargetDir);

	console.log(`[dev-env] channel=${channel} profile=${profile} CARGO_TARGET_DIR=${mergedEnv.CARGO_TARGET_DIR}`);

	const feManifestPath = resolve(
		repoRoot,
		spec.components.frontend.outputDir,
		spec.components.frontend.buildManifest,
	);
	if (existsSync(feManifestPath)) {
		const feManifest = JSON.parse(readFileSync(feManifestPath, "utf-8"));
		if (feManifest.channel && feManifest.channel !== channel) {
			console.warn(
				`[dev-env] WARNING: frontend manifest channel=${feManifest.channel} != current channel=${channel}`,
			);
			console.warn(`[dev-env] This may indicate dev/prod cross-contamination`);
			console.warn(`[dev-env] Consider running: pnpm clean:frontend`);
		}
	}

	const rustManifestPath = resolve(
		repoRoot,
		spec.components.rust.manifestPath.replace("target/", `${cargoTargetDir}/`).replace(`target/`, ""),
	);
	const rustManifestAlt = resolve(repoRoot, spec.components.rust.manifestPath);
	if (existsSync(rustManifestAlt)) {
		const rustManifest = JSON.parse(readFileSync(rustManifestAlt, "utf-8"));
		if (rustManifest.channel && rustManifest.channel !== channel) {
			console.warn(
				`[dev-env] WARNING: Rust binary manifest channel=${rustManifest.channel} != current channel=${channel}`,
			);
			console.warn(`[dev-env] Consider running: pnpm clean:rust && cargo build -p gitbutler-git -p but`);
		}
	}
} catch (err) {
	console.warn(`[dev-env] Could not validate manifests: ${err.message}`);
}

const child = spawn(command, commandArgs, {
	cwd: repoRoot,
	env: mergedEnv,
	stdio: "inherit",
	shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
	if (signal) {
		process.kill(process.pid, signal);
		return;
	}
	process.exit(code ?? 0);
});

child.on("error", (error) => {
	console.error(error);
	process.exit(1);
});

function findSpecFile(startDir) {
	let current = startDir;
	while (current !== "/" && current !== "") {
		const candidate = resolve(current, "build-artifacts.spec.json");
		if (existsSync(candidate)) return candidate;
		current = dirname(current);
	}
	throw new Error("build-artifacts.spec.json not found");
}

function parseDotEnv(source) {
	const vars = {};

	for (const rawLine of source.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;

		const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
		if (!match) continue;

		const [, key, rawValue] = match;
		vars[key] = normalizeValue(rawValue);
	}

	return vars;
}

function normalizeValue(rawValue) {
	const trimmed = rawValue.trim();

	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		const unquoted = trimmed.slice(1, -1);
		return trimmed.startsWith('"')
			? unquoted
					.replace(/\\n/g, "\n")
					.replace(/\\r/g, "\r")
					.replace(/\\t/g, "\t")
					.replace(/\\"/g, '"')
					.replace(/\\\\/g, "\\")
			: unquoted;
	}

	const commentStart = trimmed.indexOf(" #");
	return commentStart >= 0 ? trimmed.slice(0, commentStart).trimEnd() : trimmed;
}
