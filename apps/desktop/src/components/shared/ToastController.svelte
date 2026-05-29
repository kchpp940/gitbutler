<script lang="ts">
	import { dismissToast, toastStore, type ActivityTarget } from "$lib/notifications/toasts";
	import { ACTIVITY_TIMELINE_SERVICE } from "$lib/activity/activityTimelineService.svelte";
	import { inject } from "@gitbutler/core/context";
	import { InfoMessage, Markdown, TestId } from "@gitbutler/ui";
	import { slide } from "svelte/transition";

	const activityTimelineService = inject(ACTIVITY_TIMELINE_SERVICE, { optional: true });

	function openInTimeline(target: ActivityTarget, dismiss: () => void) {
		dismiss();
		activityTimelineService?.navigateTo(target);
	}
</script>

<div class="toast-controller hide-native-scrollbar">
	{#each $toastStore as toast (toast.id)}
		<!-- eslint-disable-next-line func-style -->
		{@const dismiss = () => dismissToast(toast.id)}
		<div transition:slide={{ duration: 170 }}>
			<InfoMessage
				testId={toast.testId ?? TestId.ToastInfoMessage}
				style={toast.style ?? "info"}
				error={toast.error}
				secondaryLabel={toast.activityTarget ? "View in Timeline" : toast.extraAction ? toast.extraAction.label : "Dismiss"}
				secondaryTestId={toast.extraAction ? toast.extraAction.testId : undefined}
				secondaryAction={
					toast.activityTarget
						? () => openInTimeline(toast.activityTarget!, dismiss)
						: toast.extraAction
							? () => toast.extraAction?.onClick(dismiss)
							: dismiss
				}
				tertiaryLabel={toast.activityTarget || toast.extraAction ? "Dismiss" : undefined}
				tertiaryAction={dismiss}
				shadow
			>
				{#snippet title()}
					{toast.title}
				{/snippet}

				{#snippet content()}
					{#if toast.message}
						<Markdown content={toast.message} />
					{/if}
				{/snippet}
			</InfoMessage>
		</div>
	{/each}
</div>

<style>
	.toast-controller {
		display: flex;
		z-index: var(--z-blocker);
		position: absolute;
		right: 0;
		bottom: 0;
		flex-direction: column;
		max-width: 480px;
		max-height: 100%;
		padding: 12px 12px 12px 0;
		overflow-y: auto;
		gap: 8px;
		user-select: none;
	}
</style>
