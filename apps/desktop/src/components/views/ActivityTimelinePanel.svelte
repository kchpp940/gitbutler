<script lang="ts">
	import {
		type ActivityEvent,
		type ActivityType,
		ACTIVITY_TIMELINE_SERVICE,
		formatActivityTime,
	} from "$lib/activity/activityTimelineService.svelte";
	import { STACK_SERVICE } from "$lib/stacks/stackService.svelte";
	import { inject } from "@gitbutler/core/context";
	import { Icon, TestId } from "@gitbutler/ui";
	import type { IconName } from "@gitbutler/ui/components/Icon.svelte";

	type Props = {
		projectId: string;
		onNavigateToStack?: (stackId: string, commitId?: string) => void;
		showHeader?: boolean;
	};

	const { projectId, onNavigateToStack, showHeader = true }: Props = $props();

	const activityTimelineService = inject(ACTIVITY_TIMELINE_SERVICE);
	const stackService = inject(STACK_SERVICE);

	const eventsStore = activityTimelineService.events(projectId);
	let events = $derived($eventsStore);

	const activityIcons: Record<ActivityType, IconName> = {
		commit_move: "commit-arrow-right",
		stack_reorder: "lanes",
		commit_split: "split",
		discard_changes: "bin",
		create_branch: "branch-plus",
		create_stack: "stack-plus",
		branch_tearoff: "branch-double-commit",
		commit_amend: "commit-edit",
		squash_commits: "compact",
	};

	const activityColors: Record<ActivityType, string> = {
		commit_move: "var(--chip-pop-fg)",
		stack_reorder: "var(--text-2)",
		commit_split: "var(--text-2)",
		discard_changes: "var(--text-warning)",
		create_branch: "var(--chip-tick-fg)",
		create_stack: "var(--chip-tick-fg)",
		branch_tearoff: "var(--chip-pop-fg)",
		commit_amend: "var(--text-2)",
		squash_commits: "var(--text-2)",
	};

	function handleEventClick(event: ActivityEvent) {
		if (!onNavigateToStack) return;

		const targetStackId = event.targetStackId ?? event.stackId;
		const firstCommitId = event.commitIds?.[0];

		if (targetStackId) {
			onNavigateToStack(targetStackId, firstCommitId);
		}
	}

	function canNavigate(event: ActivityEvent): boolean {
		return !!(event.targetStackId ?? event.stackId);
	}
</script>

<div class="activity-timeline" data-testid={TestId.ActivityTimelinePanel}>
	{#if showHeader}
		<div class="timeline-header">
			<Icon name="clock" size={16} color="var(--text-2)" />
			<span class="timeline-title">Activity Timeline</span>
			<span class="event-count">{events.length}</span>
		</div>
	{/if}

	<div class="timeline-content">
		{#if events.length === 0}
			<div class="empty-state">
				<Icon name="clock" size={32} color="var(--text-3)" />
				<p class="empty-text">No activity yet</p>
				<p class="empty-subtext">Your actions will appear here</p>
			</div>
		{:else}
			<div class="events-list">
				{#each events as event (event.id)}
					<button
						class="event-item"
						class:clickable={canNavigate(event)}
						onclick={() => handleEventClick(event)}
						disabled={!canNavigate(event)}
						title={canNavigate(event) ? "Click to navigate" : ""}
					>
						<div class="event-icon">
							<Icon
								name={activityIcons[event.type]}
								size={16}
								color={activityColors[event.type]}
							/>
						</div>
						<div class="event-content">
							<p class="event-message">{event.message}</p>
							{#if event.branchName}
								<span class="event-branch">
									<Icon name="branch" size={12} color="var(--text-3)" />
									{event.branchName}
								</span>
							{/if}
							<span class="event-time">{formatActivityTime(event.timestamp)}</span>
						</div>
					</button>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style lang="postcss">
	.activity-timeline {
		display: flex;
		flex-direction: column;
		height: 100%;
		background-color: var(--bg-1);
		border-left: 1px solid var(--border-2);
	}

	.timeline-header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 16px;
		border-bottom: 1px solid var(--border-2);
		flex-shrink: 0;
	}

	.timeline-title {
		font-size: 13px;
		font-weight: 600;
		color: var(--text-1);
		flex: 1;
	}

	.event-count {
		font-size: 12px;
		color: var(--text-3);
		background-color: var(--bg-2);
		padding: 2px 8px;
		border-radius: 10px;
	}

	.timeline-content {
		flex: 1;
		overflow-y: auto;
		padding: 8px;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		gap: 8px;
		padding: 24px;
	}

	.empty-text {
		font-size: 14px;
		font-weight: 500;
		color: var(--text-2);
		margin: 0;
	}

	.empty-subtext {
		font-size: 12px;
		color: var(--text-3);
		margin: 0;
	}

	.events-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.event-item {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 10px 12px;
		border-radius: var(--radius-s);
		background: transparent;
		border: none;
		text-align: left;
		width: 100%;
		cursor: default;
		transition: background-color var(--transition-fast);

		&.clickable {
			cursor: pointer;

			&:hover {
				background-color: var(--bg-2);
			}

			&:active {
				background-color: var(--bg-3);
			}
		}

		&:disabled {
			opacity: 1;
		}
	}

	.event-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		flex-shrink: 0;
		margin-top: 2px;
	}

	.event-content {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.event-message {
		font-size: 13px;
		color: var(--text-1);
		margin: 0;
		line-height: 1.4;
		word-wrap: break-word;
	}

	.event-branch {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 11px;
		color: var(--text-3);
		width: fit-content;
	}

	.event-time {
		font-size: 11px;
		color: var(--text-4);
	}
</style>
