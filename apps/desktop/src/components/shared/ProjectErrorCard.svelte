<script lang="ts">
	import { BACKEND } from "$lib/backend";
	import { goto } from "$app/navigation";
	import { showToast } from "$lib/notifications/toasts";
	import { SETTINGS_SERVICE } from "$lib/settings/appSettings";
	import { useSettingsModal } from "$lib/settings/settingsModal.svelte";
	import { PROJECT_ERROR_STORE, type ProjectErrorEntry } from "$lib/project/projectErrorStore";
	import type { AddProjectOutcome } from "$lib/project/project";
	import type { ProjectActivationIssue } from "$lib/project/projectEndpoints";
	import { inject } from "@gitbutler/core/context";
	import { InfoMessage } from "@gitbutler/ui";
	import type { MessageStyle } from "@gitbutler/ui";
	import type { Snippet } from "svelte";

	interface Props {
		entry: ProjectErrorEntry;
	}

	const { entry }: Props = $props();

	const backend = inject(BACKEND);
	const settingsService = inject(SETTINGS_SERVICE);
	const { openGeneralSettings } = useSettingsModal();

	const path = $derived(entry.context?.path);
	const projectId = $derived(entry.context?.projectId);
	const isOutcomeError = $derived(entry.source === "add-outcome");
	const isCommandError = $derived(entry.source === "command-error");
	const isActivationIssue = $derived(entry.source === "activation-issue");

	const outcome = $derived(
		isOutcomeError
			? (entry.error as Exclude<
					AddProjectOutcome,
					{ type: "added" } | { type: "alreadyExists" }
			  >)
			: null,
	);
	const cmdError = $derived(
		isCommandError
			? (entry.error as { code: string; message: string; raw?: unknown })
			: null,
	);
	const activationIssue = $derived(
		isActivationIssue ? (entry.error as ProjectActivationIssue) : null,
	);

	async function copyCommandToClipboard(command: string) {
		await navigator.clipboard.writeText(command);
		showToast({
			style: "info",
			title: "Command copied",
			message: `\`${command}\` has been copied to your clipboard.`,
		});
	}

	async function openTerminal(targetPath: string) {
		try {
			const settings = await settingsService.get();
			if (settings.preferences.terminal.which) {
				backend.runInTerminal(targetPath, settings.preferences.terminal.which, "");
			} else {
				showToast({
					style: "warning",
					title: "No terminal configured",
					message: "Please set your preferred terminal in GitButler settings.",
					extraAction: {
						label: "Open settings",
						onClick: () => openGeneralSettings("general"),
					},
				});
			}
		} catch {
			openGeneralSettings("general");
		}
	}

	function openProjects() {
		goto("/");
		dismiss();
	}

	async function retry() {
		if (entry.retry) {
			try {
				await entry.retry();
			} catch {
				// Error will be handled by the retry function
			}
		}
	}

	function dismiss() {
		PROJECT_ERROR_STORE.removeError(entry.id);
	}

	function setDontShowAgain(key: string) {
		localStorage.setItem(key, "1");
		dismiss();
	}

	$: config = $derived.by(() => {
		if (isOutcomeError && outcome) {
			return getOutcomeConfig(outcome);
		}
		if (isCommandError && cmdError) {
			return getCommandErrorConfig(cmdError);
		}
		if (isActivationIssue && activationIssue) {
			return getActivationIssueConfig(activationIssue);
		}
		return null;
	});

	function getOutcomeConfig(
		outcome: Exclude<
			AddProjectOutcome,
			{ type: "added" } | { type: "alreadyExists" }
		>,
	) {
		switch (outcome.type) {
			case "notAGitRepository": {
				const p = outcome.subject;
				return {
					style: "warning" as MessageStyle,
					title: () => "Not a valid Git repository",
					content: () =>
						`The selected directory is not a Git repository. Initialize one with \`git init\` or choose a different directory.\n\nDetails: ${p}`,
					primaryLabel: "Try again",
					primaryAction: entry.retry ? retry : dismiss,
					secondaryLabel: "Open terminal",
					secondaryAction: () => openTerminal(p),
					tertiaryLabel: "See all projects",
					tertiaryAction: openProjects,
				};
			}
			case "permissionDenied": {
				const p = outcome.subject;
				return {
					style: "danger" as MessageStyle,
					title: () => "Permission denied",
					content: () =>
						`GitButler cannot access "${p}". Check that the current user has read and write permissions for this directory and its contents.`,
					primaryLabel: "Try again",
					primaryAction: entry.retry ? retry : dismiss,
					secondaryLabel: "Open terminal",
					secondaryAction: () => openTerminal(p),
					tertiaryLabel: "See all projects",
					tertiaryAction: openProjects,
				};
			}
			case "repoOwnership": {
				const p = outcome.subject;
				const command = `git config --global --add safe.directory ${p}`;
				return {
					style: "warning" as MessageStyle,
					title: () => "Repository ownership issue",
					content: () =>
						`Git considers this repository unsafe due to ownership rules. Run the following command to allow access:\n\n\`${command}\``,
					primaryLabel: "Copy command",
					primaryAction: () => copyCommandToClipboard(command),
					secondaryLabel: "Try again",
					secondaryAction: entry.retry ? retry : dismiss,
					tertiaryLabel: "Open terminal",
					tertiaryAction: () => openTerminal(p),
				};
			}
			case "pathNotFound": {
				return {
					style: "warning" as MessageStyle,
					title: () => "Path not found",
					content: () =>
						"The specified path does not exist on the filesystem. Please choose a valid directory.",
					primaryLabel: "Try again",
					primaryAction: entry.retry ? retry : dismiss,
					secondaryLabel: "See all projects",
					secondaryAction: openProjects,
				};
			}
			case "notADirectory": {
				return {
					style: "warning" as MessageStyle,
					title: () => "Not a directory",
					content: () =>
						"The specified path is not a directory. Please select a folder containing a Git repository.",
					primaryLabel: "Try again",
					primaryAction: entry.retry ? retry : dismiss,
					secondaryLabel: "See all projects",
					secondaryAction: openProjects,
				};
			}
			case "bareRepository": {
				return {
					style: "danger" as MessageStyle,
					title: () => "Bare repository",
					content: () =>
						"The specified path is a bare Git repository. GitButler requires a repository with a working tree.",
					primaryLabel: "Try again",
					primaryAction: entry.retry ? retry : dismiss,
					secondaryLabel: "See all projects",
					secondaryAction: openProjects,
				};
			}
			case "nonMainWorktree": {
				return {
					style: "warning" as MessageStyle,
					title: () => "Non-main worktree",
					content: () =>
						"The specified path is a linked worktree, not the main working tree. GitButler only supports the main worktree.",
					primaryLabel: "Try again",
					primaryAction: entry.retry ? retry : dismiss,
					secondaryLabel: "See all projects",
					secondaryAction: openProjects,
				};
			}
			case "noWorkdir": {
				return {
					style: "warning" as MessageStyle,
					title: () => "No working directory",
					content: () =>
						"The repository does not have a working directory. GitButler requires a repository with a working tree.",
					primaryLabel: "Try again",
					primaryAction: entry.retry ? retry : dismiss,
					secondaryLabel: "See all projects",
					secondaryAction: openProjects,
				};
			}
			case "noDotGitDirectory": {
				return {
					style: "warning" as MessageStyle,
					title: () => "No .git directory",
					content: () =>
						"The specified directory does not contain a .git folder. Please select a directory that is a Git repository.",
					primaryLabel: "Try again",
					primaryAction: entry.retry ? retry : dismiss,
					secondaryLabel: "See all projects",
					secondaryAction: openProjects,
				};
			}
		}
	}

	const COMMAND_ERROR_CONFIG: Record<
		string,
		{
			title: string;
			style: MessageStyle;
			primaryLabel?: string;
			secondaryLabel?: string;
			tertiaryLabel?: string;
		}
	> = {
		ProjectDatabaseCorrupted: {
			title: "Database corrupted",
			style: "danger",
			primaryLabel: "See all projects",
		},
		ProjectDatabaseIncompatible: {
			title: "Database incompatible",
			style: "danger",
			primaryLabel: "See all projects",
		},
		ProjectFilterWarning: {
			title: "Git filters detected",
			style: "warning",
			primaryLabel: "Copy git lfs pull",
			secondaryLabel: "Dismiss",
		},
		ProjectPermissionDenied: {
			title: "Permission denied",
			style: "danger",
			primaryLabel: "Open terminal",
			secondaryLabel: "Try again",
			tertiaryLabel: "See all projects",
		},
		ProjectAlreadyOpenInAnotherWindow: {
			title: "Project already open",
			style: "info",
			primaryLabel: "See all projects",
			secondaryLabel: "Dismiss",
		},
		ProjectInvalidGitRepository: {
			title: "Not a valid Git repository",
			style: "warning",
			primaryLabel: "Try again",
			secondaryLabel: "Open terminal",
			tertiaryLabel: "See all projects",
		},
		RepoOwnership: {
			title: "Repository ownership issue",
			style: "warning",
			primaryLabel: "Copy command",
			secondaryLabel: "Try again",
			tertiaryLabel: "Open terminal",
		},
	};

	function getCommandErrorConfig(cmdError: {
		code: string;
		message: string;
		raw?: unknown;
	}) {
		const baseConfig = COMMAND_ERROR_CONFIG[cmdError.code] ?? {
			title: "Error adding project",
			style: "danger" as MessageStyle,
			primaryLabel: "Dismiss",
		};

		const p = path ?? "";
		let content = () => cmdError.message;
		let primaryAction: () => void = dismiss;
		let secondaryAction: (() => void) | undefined;
		let tertiaryAction: (() => void) | undefined;

		switch (cmdError.code) {
			case "ProjectFilterWarning": {
				const command = 'git lfs pull --include="*"';
				content = () =>
					`This repository uses Git filters that will not be applied during workspace operations. Run \`${command}\` after operations to restore files.`;
				primaryAction = () => copyCommandToClipboard(command);
				secondaryAction = dismiss;
				break;
			}
			case "ProjectPermissionDenied": {
				content = () =>
					p
						? `GitButler does not have permission to access "${p}". Check the file permissions for the project directory.`
						: cmdError.message;
				primaryAction = () => (p ? openTerminal(p) : dismiss);
				secondaryAction = entry.retry ? retry : dismiss;
				tertiaryAction = openProjects;
				break;
			}
			case "ProjectInvalidGitRepository": {
				content = () =>
					p
						? `The path "${p}" is not a valid Git repository. Initialize one with \`git init\` or choose a different directory.`
						: cmdError.message;
				primaryAction = entry.retry ? retry : dismiss;
				secondaryAction = () => (p ? openTerminal(p) : dismiss);
				tertiaryAction = openProjects;
				break;
			}
			case "RepoOwnership": {
				const command = p ? `git config --global --add safe.directory ${p}` : "";
				content = () =>
					command
						? `Git considers this repository unsafe. Run \`${command}\` to allow access.`
						: cmdError.message;
				primaryAction = command ? () => copyCommandToClipboard(command) : dismiss;
				secondaryAction = entry.retry ? retry : dismiss;
				tertiaryAction = () => (p ? openTerminal(p) : dismiss);
				break;
			}
			case "ProjectDatabaseCorrupted":
			case "ProjectDatabaseIncompatible":
			case "ProjectAlreadyOpenInAnotherWindow":
				primaryAction = openProjects;
				secondaryAction = dismiss;
				break;
			default:
				primaryAction = dismiss;
				break;
		}

		return {
			style: baseConfig.style,
			title: () => baseConfig.title,
			content,
			primaryLabel: baseConfig.primaryLabel,
			primaryAction,
			secondaryLabel: baseConfig.secondaryLabel,
			secondaryAction,
			tertiaryLabel: baseConfig.tertiaryLabel,
			tertiaryAction,
			error: cmdError.raw,
		};
	}

	function getActivationIssueConfig(issue: ProjectActivationIssue) {
		const pid = projectId ?? "";
		const dontShowAgainKey = pid
			? `git-filters--dont-show-again--${pid}`
			: "";

		switch (issue.code) {
			case "DatabaseCorrupted": {
				const details = issue.details;
				return {
					style: "danger" as MessageStyle,
					title: () => "Database corrupted and recovered",
					content: () =>
						`The database file at '${details.db_path}' was corrupted. It has been backed up to '${details.backup_path}' and a new database has been created. Your Git worktree is safe, but virtual branches and GitButler-specific settings may need to be reconfigured.`,
					primaryLabel: "See all projects",
					primaryAction: openProjects,
					error: details.error,
				};
			}
			case "FilterWarning": {
				const details = issue.details;
				const filters = details.filters.join(", ");
				const files = details.affected_files.join("\n");
				const content = details.has_lfs
					? `This repository uses Git filters (${filters}) that will not be applied during GitButler workspace operations. If you use Git LFS, run \`git lfs pull --include="*"\` after GitButler operations to restore affected files.`
					: `This repository uses Git filters (${filters}) that will not be applied during GitButler workspace operations. Changes to the following files may be affected:`;
				return {
					style: "warning" as MessageStyle,
					title: () => "Git filters detected",
					content: () => content,
					primaryLabel: "Don't show again",
					primaryAction: dontShowAgainKey
						? () => setDontShowAgain(dontShowAgainKey)
						: dismiss,
					secondaryLabel: details.has_lfs ? "Copy git lfs pull" : undefined,
					secondaryAction: details.has_lfs
						? () => copyCommandToClipboard('git lfs pull --include="*"')
						: undefined,
					tertiaryLabel: "Open terminal",
					tertiaryAction: () =>
						details.affected_files[0]
							? openTerminal(details.affected_files[0])
							: dismiss,
					error: details.affected_files.length > 0 ? files : undefined,
				};
			}
			case "AlreadyOpenInAnotherWindow": {
				return {
					style: "info" as MessageStyle,
					title: () => "Project already open in another window",
					content: () =>
						"This project is already open in another GitButler window. Opening the same project in multiple windows may cause unexpected behavior, especially when making changes to virtual branches.",
					primaryLabel: "Switch projects",
					primaryAction: openProjects,
					secondaryLabel: "Dismiss",
					secondaryAction: dismiss,
				};
			}
			case "PermissionDenied": {
				const p = issue.details.path;
				return {
					style: "danger" as MessageStyle,
					title: () => "Permission denied",
					content: () =>
						`GitButler does not have sufficient permissions to access the repository at '${p}'. Please check that the current user has read and write access to this directory and its contents.`,
					primaryLabel: "Open terminal",
					primaryAction: () => openTerminal(p),
					secondaryLabel: "See all projects",
					secondaryAction: openProjects,
				};
			}
		}
	}
</script>

{#if config}
	<InfoMessage
		style={config.style}
		filled
		shadow
		primaryLabel={config.primaryLabel}
		primaryAction={config.primaryAction}
		secondaryLabel={config.secondaryLabel}
		secondaryAction={config.secondaryAction}
		tertiaryLabel={config.tertiaryLabel}
		tertiaryAction={config.tertiaryAction}
		error={"error" in config ? (config.error as unknown as string | undefined) : undefined}
	>
		{#snippet title}
			{@render config.title()}
		{/snippet}
		{#snippet content}
			{@render config.content()}
		{/snippet}
	</InfoMessage>
{/if}
