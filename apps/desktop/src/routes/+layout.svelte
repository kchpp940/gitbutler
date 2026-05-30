<script lang="ts">
	import "@gitbutler/design-core/utility";
	import "@gitbutler/design-core/core";
	import "../styles/styles.css";
	import { browser, dev } from "$app/environment";
	import { afterNavigate, beforeNavigate } from "$app/navigation";
	import { page } from "$app/state";
	import GlobalSettingsShortcutHandler from "$components/settings/GlobalSettingsShortcutHandler.svelte";
	import ReloadShortcutHandler from "$components/settings/ReloadShortcutHandler.svelte";
	import ThemeShortcutHandler from "$components/settings/ThemeShortcutHandler.svelte";
	import ToggleSidebarShortcutHandler from "$components/settings/ToggleSidebarShortcutHandler.svelte";
	import ZoomShortcutHandler from "$components/settings/ZoomShortcutHandler.svelte";
	import AppUpdater from "$components/shared/AppUpdater.svelte";
	import FocusCursor from "$components/shared/FocusCursor.svelte";
	import GitInputPrompt from "$components/shared/GitInputPrompt.svelte";
	import ReloadWarning from "$components/shared/ReloadWarning.svelte";
	import ShareIssueModal from "$components/shared/ShareIssueModal.svelte";
	import ToastController from "$components/shared/ToastController.svelte";
	import GlobalModalRouter from "$components/views/GlobalModalRouter.svelte";
	import BootstrapDiagnostics from "$components/shared/BootstrapDiagnostics.svelte";
	import {
		bootstrap,
		handleProjectChange,
		BootstrapError,
		ProjectSwitchError,
		getDiagnostic,
		type BootstrapResult,
	} from "$lib/bootstrap/bootstrap";
	import { GIT_CONFIG_SERVICE } from "$lib/config/gitConfigService";
	import { fModeEnabled } from "$lib/config/uiFeatureFlags";
	import { PROJECTS_SERVICE } from "$lib/project/projectsService";
	import { SETTINGS_SERVICE } from "$lib/settings/appSettings";
	import { TERMINAL_SERVICE } from "$lib/settings/terminalService";
	import { createKeybind } from "$lib/shortcuts/hotkeys";
	import { SHORTCUT_SERVICE } from "$lib/shortcuts/shortcutService";
	import { CLIENT_STATE } from "$lib/state/clientState.svelte";
	import { initUserSettings, UI_STATE } from "$lib/state/uiState.svelte";
	import { POSTHOG_WRAPPER } from "$lib/telemetry/posthog";
	import { USER_SERVICE } from "$lib/user/userService.svelte";
	import { inject } from "@gitbutler/core/context";
	import { ChipToastContainer } from "@gitbutler/ui";
	import { FOCUS_MANAGER } from "@gitbutler/ui/focus/focusManager";
	import { untrack, type Snippet } from "svelte";
	import type { LayoutData } from "./$types";

	const { data, children }: { data: LayoutData; children: Snippet } = $props();
	const projectId = $derived(page.params.projectId);

	// =============================================================================
	// BOOTSTRAP & INIT
	// =============================================================================

	const { backend } = untrack(() => data);
	let bootstrapCompleted = $state(false);
	let bootstrapError = $state<Error | null>(null);
	let bootstrapDiagnostic = $state<
		import("@gitbutler/core/context").BootstrapDiagnosticResult | null
	>(null);

	(async () => {
		try {
			const result = await bootstrap(untrack(() => data));
			if (dev) {
				console.debug("[Bootstrap] Validation report:\n", result.validation.report);
			}
			bootstrapCompleted = true;
		} catch (e) {
			bootstrapError = e as Error;
			if (e instanceof BootstrapError || e instanceof ProjectSwitchError) {
				bootstrapDiagnostic = e.diagnostic;
			} else {
				try {
					bootstrapDiagnostic = getDiagnostic();
				} catch {
					// fallback: no diagnostic available
				}
			}
			console.error("[Bootstrap] Fatal error during bootstrap:", e);
		}
	})();

	$effect(() => {
		if (bootstrapCompleted && projectId) {
			try {
				handleProjectChange(projectId);
			} catch (e) {
				if (e instanceof ProjectSwitchError) {
					bootstrapError = e;
					bootstrapDiagnostic = e.diagnostic;
					bootstrapCompleted = false;
				} else {
					console.error("[Bootstrap] Error during project change:", e);
				}
			}
		}
	});

	const clientState = inject(CLIENT_STATE);
	const posthog = inject(POSTHOG_WRAPPER);
	const uiState = inject(UI_STATE);
	const terminalService = inject(TERMINAL_SERVICE);

	clientState.initPersist().then(async () => {
		await initUserSettings(uiState, backend.platformName, terminalService);
	});

	// =============================================================================
	// CORE REACTIVE STATE & EFFECTS
	// =============================================================================

	const userService = inject(USER_SERVICE);

	let coldstartLinks = $state<string[] | undefined>(undefined);
	backend
		.getColdStartDeepLinkUrls()
		.then((result) => (coldstartLinks = result))
		.catch(() => (coldstartLinks = []));

	$effect(() => {
		if (coldstartLinks !== undefined) {
			backend.initDeepLinking(
				{
					open: (path: string) => {
						projectsService.handleDeepLinkOpen(path);
					},
					login: (accessToken: string) => {
						userService.setUserAccessToken(accessToken);
					},
				},
				coldstartLinks,
			);
		}
	});

	// Project tracking
	const projectsService = inject(PROJECTS_SERVICE);
	$effect(() => {
		if (projectId) {
			projectsService.setLastOpenedProject(projectId);
		}
	});

	// Keyboard shortcuts
	const shortcutService = inject(SHORTCUT_SERVICE);
	$effect(() => shortcutService.listen());

	// =============================================================================
	// ANALYTICS & NAVIGATION
	// =============================================================================

	const gitConfig = inject(GIT_CONFIG_SERVICE);

	if (browser) {
		beforeNavigate(() => posthog.capture("$pageleave"));
		afterNavigate(() => {
			// Invalidate the git config on every navigation to ensure we have the latest
			// (in case the user changed something outside of GitButler)
			gitConfig.invalidateGitConfig();
			posthog.capture("$pageview");
		});
	}

	// =============================================================================
	// EXPERIMENTAL FEATURES
	// =============================================================================

	// App settings from backend
	const settingsService = inject(SETTINGS_SERVICE);
	const settingsStore = settingsService.appSettings;

	// IRC connections are managed by the Rust backend (irc_lifecycle.rs).
	// The backend handles auto-connect on startup and reacts to settings changes.
	// Frontend queries IRC state via RTKQ endpoints (ircApi.ts).

	// =============================================================================
	// DEBUG & DEVELOPMENT TOOLS
	// =============================================================================

	function handleKeyDown(e: KeyboardEvent) {
		// Explicitly detect cmd/ctrl + A since Tauri gets in the way of default behavior.
		// To get default behavior you can add a "Select All" predefined menu item to the
		// Edit menu, but that prevents the event from reaching the webview.
		if (
			(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) &&
			(e.metaKey || e.ctrlKey) &&
			e.key === "a" &&
			e.target
		) {
			e.target.select();
			e.preventDefault();
		} else {
			handleKeyBind(e);
		}
	}

	// Debug keyboard shortcuts
	const handleKeyBind = createKeybind({
		// Toggle next-gen safe checkout.
		"c o 3": () => {
			settingsService.updateFeatureFlags({ cv3: !$settingsStore?.featureFlags.cv3 });
		},
		// Show commit graph visualization
		"d o t": async () => {
			const projectId = page.params.projectId;
			await backend.invoke("show_graph_svg", { projectId });
		},
		// Log environment variables
		"e n v": async () => {
			let env = await backend.invoke("env_vars");
			// eslint-disable-next-line no-console
			console.log(env);
			(window as any).tauriEnv = env;
			// eslint-disable-next-line no-console
			console.log("Also written to window.tauriEnv");
		},
	});

	const focusManager = inject(FOCUS_MANAGER);
	$effect(() => focusManager.listen());

	// Pass F mode feature flag to focus manager
	$effect(() => {
		focusManager.setFModeEnabled($fModeEnabled);
	});
</script>

<svelte:window
	ondrop={(e) => e.preventDefault()}
	ondragover={(e) => e.preventDefault()}
	onkeydown={handleKeyDown}
/>

<svelte:head>
	<title>GitButler</title>
</svelte:head>

<div class="app-root" role="application" oncontextmenu={(e) => !dev && e.preventDefault()}>
	{#if bootstrapError && bootstrapDiagnostic}
		<div class="bootstrap-failure">
			<div class="failure-header">
				<h1>Application failed to start</h1>
				<p>{bootstrapError.message}</p>
			</div>
			<BootstrapDiagnostics diagnostic={bootstrapDiagnostic} />
		</div>
	{:else if bootstrapError}
		<div class="bootstrap-failure">
			<div class="failure-header">
				<h1>Application failed to start</h1>
				<p>{bootstrapError.message}</p>
			</div>
			<pre class="error-stack">{bootstrapError.stack}</pre>
		</div>
	{:else}
		{@render children()}
	{/if}
</div>
<ShareIssueModal />
<ToastController />
<ChipToastContainer />
<AppUpdater />
<GitInputPrompt />
<ZoomShortcutHandler />
<GlobalSettingsShortcutHandler />
<ReloadShortcutHandler />
<ThemeShortcutHandler />
<ToggleSidebarShortcutHandler />
<GlobalModalRouter />
<FocusCursor />

{#if import.meta.env.MODE === "development"}
	<ReloadWarning />
{/if}

<style lang="postcss">
	.app-root {
		display: flex;
		height: 100%;
		cursor: default;
	}

	.bootstrap-failure {
		display: flex;
		flex-direction: column;
		width: 100%;
		max-width: 900px;
		margin: 40px auto;
		padding: 24px;
		overflow-y: auto;
		gap: 16px;
	}

	.failure-header {
		h1 {
			margin: 0 0 8px;
			color: var(--color-red-600, #dc2626);
			font-weight: 700;
			font-size: 20px;
		}
		p {
			margin: 0;
			color: var(--text-2);
			font-size: 14px;
		}
	}

	.error-stack {
		padding: 12px;
		overflow-x: auto;
		border-radius: 8px;
		background: var(--bg-2);
		color: var(--text-2);
		font-size: 11px;
	}
</style>
