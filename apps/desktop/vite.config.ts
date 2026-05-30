import { sentrySvelteKit } from "@sentry/sveltekit";
import { sveltekit } from "@sveltejs/kit/vite";
import { svelteTesting } from "@testing-library/svelte/vite";
import { defineConfig, type Plugin } from "vitest/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import {
	getViteCacheDir,
	getFrontendOutputDir,
	getCargoTargetDir,
	loadSpec,
	findSpecFile,
} from "../../build-artifacts-utils";

const spec = loadSpec();
const CHANNEL = process.env.CHANNEL || process.env.MODE || "development";

function buildManifestPlugin(): Plugin {
	return {
		name: "gitbutler-build-manifest",
		writeBundle(options) {
			const outDir = options.dir || getFrontendOutputDir(spec);
			const specFilePath = findSpecFile();
			const projectRoot = dirname(specFilePath);

			const manifest = {
				version: "3.0.0",
				channel: CHANNEL,
				mode: process.env.MODE || "development",
				profile: spec.channels[CHANNEL]?.profile || "debug",
				cargoTargetDir: getCargoTargetDir(CHANNEL, spec),
				viteCacheDir: getViteCacheDir(CHANNEL, spec),
				timestamp: new Date().toISOString(),
				specVersion: spec.version,
			};

			const manifestDir = resolve(projectRoot, outDir);
			mkdirSync(manifestDir, { recursive: true });
			const manifestPath = resolve(manifestDir, spec.components.frontend.buildManifest);
			writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
			console.log(`[build-manifest] wrote ${manifestPath}`);
			console.log(`[build-manifest] channel=${manifest.channel} profile=${manifest.profile} cargoTargetDir=${manifest.cargoTargetDir}`);
		},
	};
}

export default defineConfig({
	plugins: [
		process.env.VITE_DEBOUNCE_RELOAD ? debounceReload() : undefined,
		buildManifestPlugin(),
		sentrySvelteKit({
			adapter: "other",
			autoInstrument: {
				load: true,
				serverLoad: false,
			},
			sourceMapsUploadOptions: {
				org: "gitbutler",
				project: "app-js",
				authToken: process.env.SENTRY_AUTH_TOKEN,
				telemetry: false,
				unstable_sentryVitePluginOptions: {
					telemetry: false,
					release: {
						name: process.env.SENTRY_RELEASE,
						create: true,
						setCommits: {
							auto: true,
							ignoreMissing: true,
							ignoreEmpty: true,
						},
					},
				},
			},
		}),
		sveltekit(),
		svelteTesting(),
	],

	// Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
	// prevent vite from obscuring rust errors
	clearScreen: false,
	// tauri expects a fixed port, fail if that port is not available
	server: {
		port: 1420,
		strictPort: true,
		fs: {
			strict: false,
		},
	},
	optimizeDeps: {
		// Exclude local packages from pre-bundling
		exclude: ["@gitbutler/core", "@gitbutler/ui", "@gitbutler/shared"],
	},
	// to make use of `TAURI_ENV_DEBUG` and other env variables
	// https://tauri.studio/v1/api/config#buildconfig.beforedevcommand
	envPrefix: ["VITE_", "TAURI_"],
	cacheDir: `../../${getViteCacheDir(CHANNEL || undefined, spec)}`,
	build: {
		outDir: getFrontendOutputDir(spec),
		rollupOptions: {
			output: {
				manualChunks: {},
			},
		},
		// Tauri supports es2021
		target: "modules",
		// minify production builds
		minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
		sourcemap: true,
	},
	test: {
		includeSource: ["src/**/*.test.{js,ts}"],
		exclude: ["node_modules/**/*", "e2e/**/*"],
		environment: "jsdom",
		setupFiles: ["./vitest-setup.js"],
		reporters: process.env.CI ? ["default", "buildkite-test-collector/vitest/reporter"] : "default",
		includeTaskLocation: true,
	},
	preview: {
		// preview port for the e2e tests
		port: 1420,
	},
});

/**
 * A module to debounce reloading when making changes to packages rather than
 * the desktop app.
 */
function debounceReload(): Plugin {
	let timeout: NodeJS.Timeout | undefined;
	let restartTimeout: NodeJS.Timeout | undefined;

	return {
		name: "debounce-reload",
		/**
		 * There is a `handleHotUpdate` callback that has the same docs, and
		 * gets called as expected, but that fails to prevent the reload.
		 */
		hotUpdate({ server, file }) {
			let mustReload = false;
			let longDelay = false;
			let serverRestart = false;

			if (isLocalPackageFile(file)) {
				mustReload = true;
				serverRestart = true;
				longDelay = true;
			} else if (isNotInDesktopApp(file)) {
				mustReload = true;
				longDelay = true;
			} else if (isSvelteKitFile(file)) {
				mustReload = true;
			}

			if (mustReload) {
				server.hot.send("gb:reload");
				const delay = getReloadDelay(longDelay);

				// If the server should restart, or the if it should reload but there's already a restart scheduled.
				if (mustReload && (serverRestart || restartTimeout !== undefined)) {
					clearTimeout(restartTimeout);
					clearTimeout(timeout);
					restartTimeout = setTimeout(() => {
						restartTimeout = undefined;
						timeout = undefined;
						server.restart();
					}, delay);
					return []; // Prevent immediate reload.
				}

				// Simple reload.
				if (mustReload) {
					clearTimeout(timeout);
					timeout = setTimeout(() => {
						timeout = undefined;
						mustReload = false;
						longDelay = false;
						server.hot.send({ type: "full-reload" });
					}, delay);
					return []; // Prevent immediate reload.
				}
			}
		},
	};
}
function isLocalPackageFile(file: string) {
	return ["gitbutler/packages/shared/dist", "gitbutler/packages/ui/dist"].some((pkg) =>
		file.includes(pkg),
	);
}

function isSvelteKitFile(file: string) {
	return file.includes(".svelte-kit");
}

function isNotInDesktopApp(file: string) {
	return !file.includes("apps/desktop");
}

function getReloadDelay(longDelay: boolean): number | undefined {
	return longDelay ? 5000 : 250;
}
