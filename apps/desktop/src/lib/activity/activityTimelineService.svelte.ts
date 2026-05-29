import { InjectionToken } from "@gitbutler/core/context";
import { showActivityToast } from "$lib/notifications/toasts";
import { writable, type Writable } from "svelte/store";

export type ActivityTarget = {
	projectId: string;
	stackId?: string;
	commitId?: string;
	eventId?: string;
};

export type ActivityType =
	| "commit_move"
	| "stack_reorder"
	| "commit_split"
	| "discard_changes"
	| "create_branch"
	| "create_stack"
	| "branch_tearoff"
	| "commit_amend"
	| "squash_commits";

export interface ActivityEvent {
	id: string;
	type: ActivityType;
	projectId: string;
	timestamp: number;
	stackId?: string;
	branchName?: string;
	commitIds?: string[];
	sourceStackId?: string;
	targetStackId?: string;
	message: string;
	details?: Record<string, unknown>;
	dedupeKey?: string;
}

export const ACTIVITY_TIMELINE_SERVICE = new InjectionToken<ActivityTimelineService>(
	"ActivityTimelineService",
);

const MAX_EVENTS_PER_PROJECT = 50;
const STORAGE_KEY_PREFIX = "gitbutler-activity-timeline-";
const DEDUPE_WINDOW_MS = 2000;

class ProjectTimeline {
	private events: ActivityEvent[] = [];
	private store: Writable<ActivityEvent[]>;
	private projectId: string;
	private lastDedupeKeys: Map<string, number> = new Map();

	constructor(projectId: string) {
		this.projectId = projectId;
		this.store = writable<ActivityEvent[]>([]);
		this.loadFromStorage();
	}

	private loadFromStorage() {
		try {
			const key = `${STORAGE_KEY_PREFIX}${this.projectId}`;
			const raw = localStorage.getItem(key);
			if (raw) {
				const parsed = JSON.parse(raw);
				if (Array.isArray(parsed)) {
					this.events = parsed;
					this.store.set([...this.events]);
				}
			}
		} catch {
			this.events = [];
		}
	}

	private saveToStorage() {
		try {
			const key = `${STORAGE_KEY_PREFIX}${this.projectId}`;
			localStorage.setItem(key, JSON.stringify(this.events));
		} catch {
		}
	}

	private shouldDedupe(dedupeKey?: string): boolean {
		if (!dedupeKey) return false;
		const now = Date.now();
		const lastTime = this.lastDedupeKeys.get(dedupeKey);
		if (lastTime && now - lastTime < DEDUPE_WINDOW_MS) {
			return true;
		}
		this.lastDedupeKeys.set(dedupeKey, now);
		return false;
	}

	addEvent(
		event: Omit<ActivityEvent, "id" | "timestamp">,
		dedupeKey?: string,
	): ActivityEvent | null {
		if (this.shouldDedupe(dedupeKey)) {
			return null;
		}

		const fullEvent: ActivityEvent = {
			...event,
			id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
			timestamp: Date.now(),
			dedupeKey,
		};

		this.events = [fullEvent, ...this.events].slice(0, MAX_EVENTS_PER_PROJECT);
		this.store.set([...this.events]);
		this.saveToStorage();

		return fullEvent;
	}

	getEvents() {
		return this.store;
	}

	clear() {
		this.events = [];
		this.store.set([]);
		try {
			const key = `${STORAGE_KEY_PREFIX}${this.projectId}`;
			localStorage.removeItem(key);
		} catch {
		}
	}
}

type ToastSpec = {
	title: string;
	message: string;
};

export class ActivityTimelineService {
	private projectTimelines = new Map<string, ProjectTimeline>();
	private navigationTarget: Writable<ActivityTarget | null> = writable(null);

	private getTimeline(projectId: string): ProjectTimeline {
		let timeline = this.projectTimelines.get(projectId);
		if (!timeline) {
			timeline = new ProjectTimeline(projectId);
			this.projectTimelines.set(projectId, timeline);
		}
		return timeline;
	}

	events(projectId: string) {
		return this.getTimeline(projectId).getEvents();
	}

	navigateTo(target: ActivityTarget) {
		this.navigationTarget.set(target);
	}

	getNavigationTarget() {
		return this.navigationTarget;
	}

	clearNavigationTarget() {
		this.navigationTarget.set(null);
	}

	private emit(
		projectedEvent: Omit<ActivityEvent, "id" | "timestamp">,
		dedupeKey: string,
		toast: ToastSpec,
		navigationTarget?: Omit<ActivityTarget, "eventId">,
	): ActivityEvent | null {
		const event = this.getTimeline(projectedEvent.projectId).addEvent(projectedEvent, dedupeKey);
		if (!event) return null;

		showActivityToast(toast.title, toast.message, {
			...navigationTarget,
			projectId: projectedEvent.projectId,
			eventId: event.id,
		});

		return event;
	}

	commitMove(
		projectId: string,
		commitIds: string[],
		sourceStackId: string,
		targetStackId: string,
		sourceBranchName?: string,
		targetBranchName?: string,
	) {
		const count = commitIds.length;
		const message =
			count === 1
				? `Moved 1 commit${sourceBranchName ? ` from ${sourceBranchName}` : ""}${targetBranchName ? ` to ${targetBranchName}` : ""}`
				: `Moved ${count} commits${sourceBranchName ? ` from ${sourceBranchName}` : ""}${targetBranchName ? ` to ${targetBranchName}` : ""}`;
		const dedupeKey = `commit-move:${projectId}:${commitIds.sort().join(",")}:${sourceStackId}:${targetStackId}`;
		return this.emit(
			{
				type: "commit_move",
				projectId,
				sourceStackId,
				targetStackId,
				commitIds,
				message,
				details: { sourceBranchName, targetBranchName, commitCount: count },
			},
			dedupeKey,
			{ title: "Commit Moved", message },
			{ stackId: targetStackId },
		);
	}

	stackReorder(
		projectId: string,
		stackId: string,
		oldIndex: number,
		newIndex: number,
		branchName?: string,
	) {
		const message = branchName
			? `Reordered stack "${branchName}" from position ${oldIndex + 1} to ${newIndex + 1}`
			: `Reordered stack from position ${oldIndex + 1} to ${newIndex + 1}`;
		const dedupeKey = `stack-reorder:${projectId}:${stackId}:${oldIndex}:${newIndex}`;
		return this.emit(
			{
				type: "stack_reorder",
				projectId,
				stackId,
				branchName,
				message,
				details: { oldIndex, newIndex },
			},
			dedupeKey,
			{ title: "Stack Reordered", message },
			{ stackId },
		);
	}

	commitSplit(
		projectId: string,
		stackId: string,
		sourceCommitId: string,
		newCommitIds: string[],
		branchName?: string,
	) {
		const message = branchName
			? `Split commit into ${newCommitIds.length} commits in ${branchName}`
			: `Split commit into ${newCommitIds.length} commits`;
		const dedupeKey = `commit-split:${projectId}:${stackId}:${sourceCommitId}`;
		return this.emit(
			{
				type: "commit_split",
				projectId,
				stackId,
				branchName,
				commitIds: [sourceCommitId, ...newCommitIds],
				message,
				details: { sourceCommitId, newCommitCount: newCommitIds.length },
			},
			dedupeKey,
			{ title: "Commit Split", message },
			{ stackId },
		);
	}

	discardChanges(
		projectId: string,
		stackId?: string,
		fileCount?: number,
		branchName?: string,
	) {
		const message = fileCount
			? `Discarded ${fileCount} file change${fileCount === 1 ? "" : "s"}${branchName ? ` in ${branchName}` : ""}`
			: `Discarded changes${branchName ? ` in ${branchName}` : ""}`;
		const dedupeKey = `discard-changes:${projectId}:${stackId ?? "unassigned"}`;
		return this.emit(
			{
				type: "discard_changes",
				projectId,
				stackId,
				branchName,
				message,
				details: { fileCount },
			},
			dedupeKey,
			{ title: "Changes Discarded", message },
			{ stackId },
		);
	}

	createBranch(
		projectId: string,
		stackId: string,
		branchName: string,
		sourceBranchName?: string,
	) {
		const message = sourceBranchName
			? `Created branch "${branchName}" from ${sourceBranchName}`
			: `Created branch "${branchName}"`;
		const dedupeKey = `create-branch:${projectId}:${stackId}:${branchName}`;
		return this.emit(
			{
				type: "create_branch",
				projectId,
				stackId,
				branchName,
				message,
				details: { sourceBranchName },
			},
			dedupeKey,
			{ title: "Branch Created", message },
			{ stackId },
		);
	}

	createStack(
		projectId: string,
		stackId: string,
		branchName?: string,
	) {
		const message = branchName
			? `Created new stack with branch "${branchName}"`
			: "Created new stack";
		const dedupeKey = `create-stack:${projectId}:${stackId}`;
		return this.emit(
			{
				type: "create_stack",
				projectId,
				stackId,
				branchName,
				message,
			},
			dedupeKey,
			{ title: "Stack Created", message },
			{ stackId },
		);
	}

	branchTearoff(
		projectId: string,
		sourceStackId: string,
		targetStackId: string,
		branchName: string,
	) {
		const message = `Tore off branch "${branchName}" into new stack`;
		const dedupeKey = `branch-tearoff:${projectId}:${sourceStackId}:${branchName}`;
		return this.emit(
			{
				type: "branch_tearoff",
				projectId,
				sourceStackId,
				targetStackId,
				branchName,
				message,
			},
			dedupeKey,
			{ title: "Branch Torn Off", message },
			{ stackId: targetStackId },
		);
	}

	commitAmend(
		projectId: string,
		stackId: string,
		commitId: string,
		branchName?: string,
	) {
		const message = branchName
			? `Amended commit in ${branchName}`
			: "Amended commit";
		const dedupeKey = `commit-amend:${projectId}:${stackId}:${commitId}`;
		return this.emit(
			{
				type: "commit_amend",
				projectId,
				stackId,
				branchName,
				commitIds: [commitId],
				message,
			},
			dedupeKey,
			{ title: "Commit Amended", message },
			{ stackId, commitId },
		);
	}

	squashCommits(
		projectId: string,
		stackId: string,
		sourceCommitIds: string[],
		targetCommitId: string,
		branchName?: string,
	) {
		const message = branchName
			? `Squashed ${sourceCommitIds.length} commits into one in ${branchName}`
			: `Squashed ${sourceCommitIds.length} commits into one`;
		const dedupeKey = `squash-commits:${projectId}:${stackId}:${targetCommitId}`;
		return this.emit(
			{
				type: "squash_commits",
				projectId,
				stackId,
				branchName,
				commitIds: [targetCommitId, ...sourceCommitIds],
				message,
				details: { sourceCommitCount: sourceCommitIds.length },
			},
			dedupeKey,
			{ title: "Commits Squashed", message },
			{ stackId, commitId: targetCommitId },
		);
	}

	clearProject(projectId: string) {
		this.projectTimelines.get(projectId)?.clear();
	}
}

export function formatActivityTime(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;

	const seconds = Math.floor(diff / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (seconds < 60) {
		return "Just now";
	} else if (minutes < 60) {
		return `${minutes}m ago`;
	} else if (hours < 24) {
		return `${hours}h ago`;
	} else if (days < 7) {
		return `${days}d ago`;
	} else {
		const date = new Date(timestamp);
		return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
	}
}
