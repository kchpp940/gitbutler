import {
	PromptService as AIPromptService,
	PROMPT_SERVICE as AI_PROMPT_SERVICE,
} from "$lib/ai/aiPromptService";
import { AIService, AI_SERVICE } from "$lib/ai/service";
import { CommitAnalytics, COMMIT_ANALYTICS } from "$lib/analytics/commitAnalytics";
import { type IBackend } from "$lib/backend";
import { BACKEND } from "$lib/backend";
import ClipboardService, { CLIPBOARD_SERVICE } from "$lib/backend/clipboard";
import URLService, { URL_SERVICE } from "$lib/backend/url";
import BaseBranchService, { BASE_BRANCH_SERVICE } from "$lib/baseBranch/baseBranchService.svelte";
import { BranchService, BRANCH_SERVICE } from "$lib/branches/branchService.svelte";
import CLIManager, { CLI_MANAGER } from "$lib/config/cli";
import { GIT_CONFIG_SERVICE, GitConfigService } from "$lib/config/gitConfigService";
import DependencyService, { DEPENDENCY_SERVICE } from "$lib/dependencies/dependencyService.svelte";
import { DropzoneRegistry, DROPZONE_REGISTRY } from "$lib/dragging/registry";
import {
	REORDER_DROPZONE_FACTORY,
	ReorderDropzoneFactory,
} from "$lib/dragging/stackingReorderDropzoneManager";
import { FILE_SERVICE, FileService } from "$lib/files/fileService";
import { ResizeSync, RESIZE_SYNC } from "$lib/floating/resizeSync";
import { DefaultForgeFactory, DEFAULT_FORGE_FACTORY } from "$lib/forge/forgeFactory.svelte";
import { GITHUB_CLIENT, GitHubClient } from "$lib/forge/github/githubClient";
import { GitHubUserService, GITHUB_USER_SERVICE } from "$lib/forge/github/githubUserService.svelte";
import { GITLAB_CLIENT, GitLabClient } from "$lib/forge/gitlab/gitlabClient.svelte";
import { GITLAB_USER_SERVICE, GitLabUserService } from "$lib/forge/gitlab/gitlabUserService.svelte";
import { CherryApplyService, CHERRY_APPLY_SERVICE } from "$lib/git/cherryApplyService";
import { GitService, GIT_SERVICE } from "$lib/git/gitService";
import { HOOKS_SERVICE, HooksService } from "$lib/git/hooksService";
import { REMOTES_SERVICE, RemotesService } from "$lib/git/remotesService";
import { HISTORY_SERVICE, HistoryService } from "$lib/history/history";
import { OplogService, OPLOG_SERVICE } from "$lib/history/oplogService.svelte";
import { DiffService, DIFF_SERVICE } from "$lib/hunks/diffService.svelte";
import { IrcApiService, IRC_API_SERVICE } from "$lib/irc/ircApiService";
import {
	WORKING_FILES_BROADCAST,
	WorkingFilesBroadcast,
} from "$lib/irc/workingFilesBroadcast.svelte";
import { ModeService, MODE_SERVICE } from "$lib/mode/modeService";
import { ProjectsService, PROJECTS_SERVICE } from "$lib/project/projectsService";
import { PROMPT_SERVICE, PromptService } from "$lib/prompt/promptService";
import RulesService, { RULES_SERVICE } from "$lib/rules/rulesService.svelte";
import { RustSecretService, SECRET_SERVICE } from "$lib/secrets/secretsService";
import {
	FileSelectionManager,
	FILE_SELECTION_MANAGER,
} from "$lib/selection/fileSelectionManager.svelte";
import { UncommittedService, UNCOMMITTED_SERVICE } from "$lib/selection/uncommittedService.svelte";
import { SETTINGS_SERVICE, SettingsService } from "$lib/settings/appSettings";
import { TerminalService, TERMINAL_SERVICE } from "$lib/settings/terminalService";
import { ShortcutService, SHORTCUT_SERVICE } from "$lib/shortcuts/shortcutService";
import { StackService, STACK_SERVICE } from "$lib/stacks/stackService.svelte";
import { ClientState, CLIENT_STATE } from "$lib/state/clientState.svelte";
import { UiState, UI_STATE, uiStateSlice } from "$lib/state/uiState.svelte";
import DataSharingService, { DATA_SHARING_SERVICE } from "$lib/support/dataSharing";
import { EVENT_CONTEXT, EventContext } from "$lib/telemetry/eventContext";
import { POSTHOG_WRAPPER, PostHogWrapper } from "$lib/telemetry/posthog";
import { UPDATER_SERVICE, UpdaterService } from "$lib/updater/updater";
import {
	UpstreamIntegrationService,
	UPSTREAM_INTEGRATION_SERVICE,
} from "$lib/upstream/upstreamIntegrationService.svelte";
import { TokenMemoryService } from "$lib/user/tokenMemoryService";
import { USER_SERVICE, UserService } from "$lib/user/userService.svelte";
import { WorktreeService, WORKTREE_SERVICE } from "$lib/worktree/worktreeService.svelte";
import {
	StartupPhase,
	type DIContainer,
	type InjectionToken,
	type ServiceScope,
	type RtkApiType,
} from "@gitbutler/core/context";
import { FeedService, FEED_SERVICE } from "@gitbutler/shared/feeds/service";
import { HttpClient, HTTP_CLIENT } from "@gitbutler/shared/network/httpClient";
import {
	OrganizationService,
	ORGANIZATION_SERVICE,
} from "@gitbutler/shared/organizations/organizationService";
import { reactive } from "@gitbutler/shared/reactiveUtils.svelte";
import { AppState, APP_STATE, APP_DISPATCH } from "@gitbutler/shared/redux/store.svelte";
import { UPLOADS_SERVICE, UploadsService } from "@gitbutler/shared/uploads/uploadsService";
import {
	UserService as CloudUserService,
	USER_SERVICE as CLOUD_USER_SERVICE,
} from "@gitbutler/shared/users/userService";
import { DragStateService, DRAG_STATE_SERVICE } from "@gitbutler/ui/drag/dragStateService.svelte";
import { FModeManager } from "@gitbutler/ui/focus/fModeManager";
import { FOCUS_MANAGER, FocusManager } from "@gitbutler/ui/focus/focusManager";
import {
	EXTERNAL_LINK_SERVICE,
	type ExternalLinkService,
} from "@gitbutler/ui/utils/externalLinkService";
import { IMECompositionHandler, IME_COMPOSITION_HANDLER } from "@gitbutler/ui/utils/imeHandling";
import type { AppSettings } from "@gitbutler/but-sdk";
import { PUBLIC_API_BASE_URL } from "$env/static/public";

type InitDepsArgs = {
	backend: IBackend;
	appSettings: AppSettings;
	settingsService: SettingsService;
	posthog: PostHogWrapper;
	eventContext: EventContext;
	homeDir: string;
};

type ServiceRegistration = {
	token: InjectionToken<unknown>;
	value: unknown;
	scope: ServiceScope;
	dependencies: InjectionToken<unknown>[];
	rtkDependencies?: RtkApiType[];
};

export async function initDependencies(args: InitDepsArgs, container: DIContainer) {
	const { backend, settingsService, appSettings, homeDir, posthog, eventContext } = args;
	const registrations: ServiceRegistration[] = [];

	// ============================================================================
	// PHASE 1: FOUNDATION - Core services that others depend on
	// ============================================================================
	container.startPhase(StartupPhase.FOUNDATION);

	const appState = new AppState();
	registrations.push({
		token: APP_STATE,
		value: appState,
		scope: "global",
		dependencies: [],
	});
	registrations.push({
		token: APP_DISPATCH,
		value: appState.appDispatch,
		scope: "global",
		dependencies: [APP_STATE],
	});
	registrations.push({
		token: BACKEND,
		value: backend,
		scope: "global",
		dependencies: [],
	});
	registrations.push({
		token: POSTHOG_WRAPPER,
		value: posthog,
		scope: "global",
		dependencies: [],
	});
	registrations.push({
		token: EVENT_CONTEXT,
		value: eventContext,
		scope: "global",
		dependencies: [],
	});
	registrations.push({
		token: SETTINGS_SERVICE,
		value: settingsService,
		scope: "global",
		dependencies: [],
	});

	container.endPhase();

	// ============================================================================
	// PHASE 2: AUTHENTICATION & SECURITY
	// ============================================================================
	container.startPhase(StartupPhase.AUTHENTICATION);

	const secretsService = new RustSecretService(backend);
	const tokenMemoryService = new TokenMemoryService();
	const httpClient = new HttpClient(window.fetch, PUBLIC_API_BASE_URL, tokenMemoryService.token);

	registrations.push({
		token: SECRET_SERVICE,
		value: secretsService,
		scope: "global",
		dependencies: [BACKEND],
	});
	registrations.push({
		token: HTTP_CLIENT,
		value: httpClient,
		scope: "global",
		dependencies: [SECRET_SERVICE],
	});

	container.endPhase();

	// ============================================================================
	// PHASE 3: FORGE CLIENTS & INTEGRATIONS
	// ============================================================================
	container.startPhase(StartupPhase.CORE_SERVICES);

	const gitHubClient = new GitHubClient();
	const gitLabClient = new GitLabClient();

	registrations.push({
		token: GITHUB_CLIENT,
		value: gitHubClient,
		scope: "project",
		dependencies: [],
	});
	registrations.push({
		token: GITLAB_CLIENT,
		value: gitLabClient,
		scope: "project",
		dependencies: [],
	});

	container.endPhase();

	// ============================================================================
	// PHASE 4: STATE MANAGEMENT
	// ============================================================================
	container.startPhase(StartupPhase.STATE_MANAGEMENT);

	const clientState = new ClientState(backend, gitHubClient, gitLabClient, posthog);
	const githubUserService = new GitHubUserService(clientState.backendApi);
	const gitlabUserService = new GitLabUserService(clientState.backendApi, secretsService);

	const uiState = new UiState(
		reactive(() => clientState.uiState ?? uiStateSlice.getInitialState()),
		clientState.dispatch,
	);

	registrations.push({
		token: CLIENT_STATE,
		value: clientState,
		scope: "global",
		dependencies: [BACKEND, GITHUB_CLIENT, GITLAB_CLIENT, POSTHOG_WRAPPER],
	});
	registrations.push({
		token: GITHUB_USER_SERVICE,
		value: githubUserService,
		scope: "global",
		dependencies: [CLIENT_STATE],
	});
	registrations.push({
		token: GITLAB_USER_SERVICE,
		value: gitlabUserService,
		scope: "global",
		dependencies: [CLIENT_STATE, SECRET_SERVICE],
	});
	registrations.push({
		token: UI_STATE,
		value: uiState,
		scope: "project",
		dependencies: [CLIENT_STATE],
	});

	container.endPhase();

	// ============================================================================
	// PHASE 4.5: RTK API CREATION - Register RTK Query APIs and reset handlers
	// ============================================================================
	container.startPhase(StartupPhase.RTK_API_CREATION);

	container.registerRtkApi("backend", "backend", {
		isProjectScoped: true,
		resetHandler: () => clientState.backendApi.util.resetApiState(),
	});
	container.registerRtkApi("github", "github", {
		isProjectScoped: true,
		resetHandler: () => clientState.githubApi.util.resetApiState(),
	});
	container.registerRtkApi("gitlab", "gitlab", {
		isProjectScoped: true,
		resetHandler: () => clientState.gitlabApi.util.resetApiState(),
	});

	container.endPhase();

	// ============================================================================
	// PHASE 5: CONFIGURATION & SETTINGS
	// ============================================================================
	container.startPhase(StartupPhase.CONFIGURATION);

	const projectsService = new ProjectsService(clientState.backendApi, homeDir, backend);
	const gitConfig = new GitConfigService(clientState.backendApi, clientState.dispatch, backend);
	const terminalService = new TerminalService(backend);

	registrations.push({
		token: PROJECTS_SERVICE,
		value: projectsService,
		scope: "global",
		dependencies: [CLIENT_STATE, BACKEND],
	});
	registrations.push({
		token: GIT_CONFIG_SERVICE,
		value: gitConfig,
		scope: "project",
		dependencies: [CLIENT_STATE, BACKEND],
	});
	registrations.push({
		token: TERMINAL_SERVICE,
		value: terminalService,
		scope: "global",
		dependencies: [BACKEND],
	});

	container.endPhase();

	// ============================================================================
	// PHASE 6: CORE SERVICES (AI, Git, Forge)
	// ============================================================================
	container.startPhase(StartupPhase.CORE_SERVICES);

	const aiPromptService = new AIPromptService();
	const aiService = new AIService(gitConfig, secretsService, httpClient, tokenMemoryService);
	const userService = new UserService(
		clientState.backendApi,
		backend,
		tokenMemoryService,
		posthog,
		uiState,
	);
	const ircApiService = new IrcApiService(clientState.backendApi);
	const workingFilesBroadcast = new WorkingFilesBroadcast(backend);

	const forgeFactory = new DefaultForgeFactory({
		gitHubClient,
		gitLabClient,
		backendApi: clientState.backendApi,
		gitHubApi: clientState.githubApi,
		gitLabApi: clientState.gitlabApi,
		dispatch: clientState.dispatch,
		posthog,
	});

	const gitService = new GitService(backend, clientState.backendApi);
	const baseBranchService = new BaseBranchService(clientState.backendApi);
	const branchService = new BranchService(clientState.backendApi);
	const cherryApplyService = new CherryApplyService(clientState.backendApi);
	const remotesService = new RemotesService(backend);
	const hooksService = new HooksService(clientState.backendApi);

	registrations.push(
		{ token: AI_PROMPT_SERVICE, value: aiPromptService, scope: "global", dependencies: [] },
		{
			token: AI_SERVICE,
			value: aiService,
			scope: "global",
			dependencies: [GIT_CONFIG_SERVICE, SECRET_SERVICE, HTTP_CLIENT],
		},
		{
			token: USER_SERVICE,
			value: userService,
			scope: "global",
			dependencies: [CLIENT_STATE, BACKEND, SECRET_SERVICE, POSTHOG_WRAPPER, UI_STATE],
			rtkDependencies: ["backend"],
		},
		{
			token: IRC_API_SERVICE,
			value: ircApiService,
			scope: "global",
			dependencies: [CLIENT_STATE],
			rtkDependencies: ["backend"],
		},
		{
			token: WORKING_FILES_BROADCAST,
			value: workingFilesBroadcast,
			scope: "project",
			dependencies: [BACKEND],
		},
		{
			token: DEFAULT_FORGE_FACTORY,
			value: forgeFactory,
			scope: "project",
			dependencies: [GITHUB_CLIENT, GITLAB_CLIENT, CLIENT_STATE, POSTHOG_WRAPPER],
			rtkDependencies: ["backend", "github", "gitlab"],
		},
		{
			token: GIT_SERVICE,
			value: gitService,
			scope: "project",
			dependencies: [BACKEND, CLIENT_STATE],
			rtkDependencies: ["backend"],
		},
		{
			token: BASE_BRANCH_SERVICE,
			value: baseBranchService,
			scope: "project",
			dependencies: [CLIENT_STATE],
			rtkDependencies: ["backend"],
		},
		{
			token: BRANCH_SERVICE,
			value: branchService,
			scope: "project",
			dependencies: [CLIENT_STATE],
			rtkDependencies: ["backend"],
		},
		{
			token: CHERRY_APPLY_SERVICE,
			value: cherryApplyService,
			scope: "project",
			dependencies: [CLIENT_STATE],
			rtkDependencies: ["backend"],
		},
		{ token: REMOTES_SERVICE, value: remotesService, scope: "project", dependencies: [BACKEND] },
		{
			token: HOOKS_SERVICE,
			value: hooksService,
			scope: "project",
			dependencies: [CLIENT_STATE],
			rtkDependencies: ["backend"],
		},
	);

	container.endPhase();

	// ============================================================================
	// PHASE 7: FEATURE SERVICES (Stacks, Workspace, Files)
	// ============================================================================
	container.startPhase(StartupPhase.FEATURE_SERVICES);

	const stackService = new StackService(
		clientState.backendApi,
		clientState.dispatch,
		forgeFactory,
		uiState,
	);
	const modeService = new ModeService(clientState.backendApi);
	const rulesService = new RulesService(clientState.backendApi);
	const worktreeService = new WorktreeService(clientState.backendApi);

	const fileService = new FileService(backend, clientState.backendApi);
	const diffService = new DiffService(clientState.backendApi);

	const fModeManager = new FModeManager();
	const focusManager = new FocusManager(fModeManager);
	const historyService = new HistoryService(backend, clientState.backendApi);
	const oplogService = new OplogService(clientState.backendApi);
	const commitAnalytics = new CommitAnalytics(
		stackService,
		uiState,
		worktreeService,
		rulesService,
		fModeManager,
		projectsService,
	);

	const uncommittedService = new UncommittedService(clientState, worktreeService, diffService);
	const fileSelectionManager = new FileSelectionManager(
		stackService,
		uncommittedService,
		worktreeService,
		oplogService,
		historyService,
	);

	const dependencyService = new DependencyService(worktreeService);

	const upstreamIntegrationService = new UpstreamIntegrationService(
		clientState.backendApi,
		stackService,
	);

	const feedService = new FeedService(httpClient, appState.appDispatch);

	const uploadsService = new UploadsService(httpClient);
	const organizationService = new OrganizationService(httpClient, appState.appDispatch);
	const cloudUserService = new CloudUserService(httpClient, appState.appDispatch);

	registrations.push(
		{
			token: STACK_SERVICE,
			value: stackService,
			scope: "project",
			dependencies: [CLIENT_STATE, DEFAULT_FORGE_FACTORY, UI_STATE],
			rtkDependencies: ["backend"],
		},
		{
			token: MODE_SERVICE,
			value: modeService,
			scope: "project",
			dependencies: [CLIENT_STATE],
			rtkDependencies: ["backend"],
		},
		{
			token: RULES_SERVICE,
			value: rulesService,
			scope: "project",
			dependencies: [CLIENT_STATE],
			rtkDependencies: ["backend"],
		},
		{
			token: WORKTREE_SERVICE,
			value: worktreeService,
			scope: "project",
			dependencies: [CLIENT_STATE],
			rtkDependencies: ["backend"],
		},
		{
			token: FILE_SERVICE,
			value: fileService,
			scope: "project",
			dependencies: [BACKEND, CLIENT_STATE],
			rtkDependencies: ["backend"],
		},
		{
			token: DIFF_SERVICE,
			value: diffService,
			scope: "project",
			dependencies: [CLIENT_STATE],
			rtkDependencies: ["backend"],
		},
		{
			token: HISTORY_SERVICE,
			value: historyService,
			scope: "project",
			dependencies: [BACKEND, CLIENT_STATE],
			rtkDependencies: ["backend"],
		},
		{
			token: OPLOG_SERVICE,
			value: oplogService,
			scope: "project",
			dependencies: [CLIENT_STATE],
			rtkDependencies: ["backend"],
		},
		{
			token: COMMIT_ANALYTICS,
			value: commitAnalytics,
			scope: "project",
			dependencies: [STACK_SERVICE, UI_STATE, WORKTREE_SERVICE, RULES_SERVICE, PROJECTS_SERVICE],
		},
		{
			token: UNCOMMITTED_SERVICE,
			value: uncommittedService,
			scope: "project",
			dependencies: [CLIENT_STATE, WORKTREE_SERVICE, DIFF_SERVICE],
			rtkDependencies: ["backend"],
		},
		{
			token: FILE_SELECTION_MANAGER,
			value: fileSelectionManager,
			scope: "project",
			dependencies: [
				STACK_SERVICE,
				UNCOMMITTED_SERVICE,
				WORKTREE_SERVICE,
				OPLOG_SERVICE,
				HISTORY_SERVICE,
			],
		},
		{
			token: DEPENDENCY_SERVICE,
			value: dependencyService,
			scope: "project",
			dependencies: [WORKTREE_SERVICE],
		},
		{
			token: UPSTREAM_INTEGRATION_SERVICE,
			value: upstreamIntegrationService,
			scope: "project",
			dependencies: [CLIENT_STATE, STACK_SERVICE],
			rtkDependencies: ["backend"],
		},
		{
			token: FEED_SERVICE,
			value: feedService,
			scope: "global",
			dependencies: [HTTP_CLIENT, APP_DISPATCH],
		},
		{ token: UPLOADS_SERVICE, value: uploadsService, scope: "global", dependencies: [HTTP_CLIENT] },
		{
			token: ORGANIZATION_SERVICE,
			value: organizationService,
			scope: "global",
			dependencies: [HTTP_CLIENT, APP_DISPATCH],
		},
		{
			token: CLOUD_USER_SERVICE,
			value: cloudUserService,
			scope: "global",
			dependencies: [HTTP_CLIENT, APP_DISPATCH],
		},
	);

	container.endPhase();

	// ============================================================================
	// PHASE 8: UI & INTERACTION SERVICES
	// ============================================================================
	container.startPhase(StartupPhase.UI_SERVICES);

	const imeHandler = new IMECompositionHandler();
	const reorderDropzoneFactory = new ReorderDropzoneFactory(stackService, uiState);
	const shortcutService = new ShortcutService(backend);
	const dragStateService = new DragStateService();
	const dropzoneRegistry = new DropzoneRegistry();
	const resizeSync = new ResizeSync();

	const cliManager = new CLIManager(clientState.backendApi);
	const dataSharingService = new DataSharingService(clientState.backendApi);
	const promptService = new PromptService(backend);
	const updaterService = new UpdaterService(
		backend,
		posthog,
		shortcutService,
		Number(appSettings.ui.checkForUpdatesIntervalInSeconds) * 1000,
	);

	const urlService = new URLService(backend);
	const clipboardService = new ClipboardService(backend);
	const externalLinkService = {
		open: async (url) => await urlService.openExternalUrl(url),
	} satisfies ExternalLinkService;

	registrations.push(
		{ token: IME_COMPOSITION_HANDLER, value: imeHandler, scope: "global", dependencies: [] },
		{
			token: REORDER_DROPZONE_FACTORY,
			value: reorderDropzoneFactory,
			scope: "project",
			dependencies: [STACK_SERVICE, UI_STATE],
		},
		{ token: SHORTCUT_SERVICE, value: shortcutService, scope: "global", dependencies: [BACKEND] },
		{ token: DRAG_STATE_SERVICE, value: dragStateService, scope: "global", dependencies: [] },
		{ token: DROPZONE_REGISTRY, value: dropzoneRegistry, scope: "global", dependencies: [] },
		{ token: RESIZE_SYNC, value: resizeSync, scope: "global", dependencies: [] },
		{ token: FOCUS_MANAGER, value: focusManager, scope: "global", dependencies: [] },
		{
			token: CLI_MANAGER,
			value: cliManager,
			scope: "global",
			dependencies: [CLIENT_STATE],
			rtkDependencies: ["backend"],
		},
		{
			token: DATA_SHARING_SERVICE,
			value: dataSharingService,
			scope: "global",
			dependencies: [CLIENT_STATE],
			rtkDependencies: ["backend"],
		},
		{ token: PROMPT_SERVICE, value: promptService, scope: "global", dependencies: [BACKEND] },
		{
			token: UPDATER_SERVICE,
			value: updaterService,
			scope: "global",
			dependencies: [BACKEND, POSTHOG_WRAPPER, SHORTCUT_SERVICE],
		},
		{ token: URL_SERVICE, value: urlService, scope: "global", dependencies: [BACKEND] },
		{ token: CLIPBOARD_SERVICE, value: clipboardService, scope: "global", dependencies: [BACKEND] },
		{
			token: EXTERNAL_LINK_SERVICE,
			value: externalLinkService,
			scope: "global",
			dependencies: [URL_SERVICE],
		},
	);

	container.endPhase();

	// ============================================================================
	// BULK REGISTRATION
	// ============================================================================
	for (const reg of registrations) {
		container.register(reg.token, reg.value, {
			scope: reg.scope,
			dependencies: reg.dependencies,
			rtkDependencies: reg.rtkDependencies,
		});
	}
}
