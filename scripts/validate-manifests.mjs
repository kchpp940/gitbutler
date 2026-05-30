import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

const repoRoot = resolve(dirname(import.meta.url.replace("file://", "")), "..");

const channel = process.env.CHANNEL || process.env.MODE || "development";

try {
	const specPath = findSpecFile(repoRoot);
	const spec = JSON.parse(readFileSync(specPath, "utf-8"));

	const channelConfig = spec.channels[channel] || spec.channels.dev;
	if (!channelConfig) {
		console.warn(`[validate-manifests] no config for channel=${channel}, skipping validation`);
		process.exit(0);
	}

	const profile = channelConfig.profile;
	const expectedCargoTargetDir = channelConfig.cargoTargetDir;
	let hasIssues = false;

	const feManifestPath = resolve(
		repoRoot,
		spec.components.frontend.outputDir,
		spec.components.frontend.buildManifest,
	);
	if (existsSync(feManifestPath)) {
		const feManifest = JSON.parse(readFileSync(feManifestPath, "utf-8"));
		if (feManifest.channel && feManifest.channel !== channel) {
			console.error(
				`[validate-manifests] ERROR: frontend manifest channel=${feManifest.channel} != current channel=${channel}`,
			);
			console.error(`[validate-manifests] Dev/prod cross-contamination detected! Run: pnpm clean:frontend`);
			hasIssues = true;
		}
		if (feManifest.profile && feManifest.profile !== profile) {
			console.error(
				`[validate-manifests] ERROR: frontend manifest profile=${feManifest.profile} != current profile=${profile}`,
			);
			hasIssues = true;
		}
		if (feManifest.cargoTargetDir && feManifest.cargoTargetDir !== expectedCargoTargetDir) {
			console.error(
				`[validate-manifests] ERROR: frontend manifest cargoTargetDir=${feManifest.cargoTargetDir} != expected ${expectedCargoTargetDir}`,
			);
			hasIssues = true;
		}
		if (!hasIssues) {
			console.log(
				`[validate-manifests] frontend manifest OK: channel=${feManifest.channel} profile=${feManifest.profile}`,
			);
		}
	} else {
		console.log(`[validate-manifests] no existing frontend manifest, will be created by build`);
	}

	const rustManifestPath = resolve(repoRoot, spec.components.rust.manifestPath);
	if (existsSync(rustManifestPath)) {
		const rustManifest = JSON.parse(readFileSync(rustManifestPath, "utf-8"));
		if (rustManifest.channel && rustManifest.channel !== channel) {
			console.error(
				`[validate-manifests] ERROR: Rust manifest channel=${rustManifest.channel} != current channel=${channel}`,
			);
			hasIssues = true;
		}
		if (rustManifest.profile && rustManifest.profile !== profile) {
			console.error(
				`[validate-manifests] ERROR: Rust manifest profile=${rustManifest.profile} != current profile=${profile}`,
			);
			hasIssues = true;
		}
		if (!hasIssues) {
			console.log(
				`[validate-manifests] Rust manifest OK: channel=${rustManifest.channel} profile=${rustManifest.profile}`,
			);
		}
	} else {
		console.log(`[validate-manifests] no existing Rust manifest, will be created after cargo build`);
	}

	if (channelConfig.bundle) {
		const sidecarManifestPath = resolve(
			repoRoot,
			spec.components.sidecar.injectDir,
			spec.components.sidecar.integrityManifest,
		);
		if (existsSync(sidecarManifestPath)) {
			const scManifest = JSON.parse(readFileSync(sidecarManifestPath, "utf-8"));
			if (scManifest.channel && scManifest.channel !== channel) {
				console.error(
					`[validate-manifests] ERROR: sidecar manifest channel=${scManifest.channel} != current channel=${channel}`,
				);
				hasIssues = true;
			}
			if (scManifest.profile && scManifest.profile !== profile) {
				console.error(
					`[validate-manifests] ERROR: sidecar manifest profile=${scManifest.profile} != current profile=${profile}`,
				);
				hasIssues = true;
			}
			if (!hasIssues) {
				console.log(
					`[validate-manifests] sidecar manifest OK: channel=${scManifest.channel} profile=${scManifest.profile}`,
				);
			}
		}
	}

	if (hasIssues) {
		console.error(
			`[validate-manifests] stale manifests detected - channel/profile mismatch. Clean and rebuild.`,
		);
		console.error(`[validate-manifests] Run: pnpm clean:manifest && rebuild`);
		process.exit(1);
	}

	console.log(`[validate-manifests] all existing manifests consistent with channel=${channel} profile=${profile}`);
} catch (err) {
	if (err.message?.includes("not found")) {
		console.warn(`[validate-manifests] spec file not found, skipping validation`);
	} else {
		console.warn(`[validate-manifests] validation error: ${err.message}`);
	}
}

function findSpecFile(startDir) {
	let current = startDir;
	while (current !== "/" && current !== "") {
		const candidate = resolve(current, "build-artifacts.spec.json");
		if (existsSync(candidate)) return candidate;
		current = dirname(current);
	}
	throw new Error("build-artifacts.spec.json not found");
}
