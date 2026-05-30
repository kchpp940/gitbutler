<script lang="ts">
	import { GLOBAL_DRAFT_STORE } from "$lib/settings/globalDraftStore";
	import { CardGroup, Link, TestId, Toggle } from "@gitbutler/ui";

	const globalDraftStore = GLOBAL_DRAFT_STORE;
	const telemetry = $derived(globalDraftStore.draft.appSettings.telemetry);
	const errorReportingEnabled = $derived(telemetry?.appErrorReportingEnabled);
	const metricsEnabled = $derived(telemetry?.appMetricsEnabled);
	const nonAnonMetricsEnabled = $derived(telemetry?.appNonAnonMetricsEnabled);
</script>

<div class="analytics-settings__content">
	<p class="text-13 text-body analytics-settings__text">
		GitButler uses telemetry strictly to help us improve the client. We do not collect any personal
		information, unless explicitly allowed below. <Link href="https://gitbutler.com/privacy">
			Privacy policy
		</Link>
	</p>
	<p class="text-13 text-body analytics-settings__text">
		We kindly ask you to consider keeping these settings enabled as it helps us catch issues more
		quickly. If you choose to disable them, please feel free to share your feedback on our <Link
			href="https://discord.gg/MmFkmaJ42D"
		>
			Discord
		</Link>.
	</p>
</div>

<CardGroup testId={TestId.OnboardingPageAnalyticsSettings}>
	<CardGroup.Item labelFor="errorReportingToggle">
		{#snippet title()}
			Error reporting
		{/snippet}
		{#snippet caption()}
			Toggle reporting of application crashes and errors.
		{/snippet}
		{#snippet actions()}
			<Toggle
				id="errorReportingToggle"
				testId={TestId.OnboardingPageAnalyticsSettingsErrorReportingToggle}
				checked={errorReportingEnabled}
				onclick={() =>
					globalDraftStore.updateAppSettings({
						telemetry: {
							...globalDraftStore.draft.appSettings.telemetry,
							appErrorReportingEnabled: !errorReportingEnabled,
						},
					})}
			/>
		{/snippet}
	</CardGroup.Item>

	<CardGroup.Item labelFor="metricsEnabledToggle">
		{#snippet title()}
			Usage metrics
		{/snippet}
		{#snippet caption()}
			Toggle sharing of usage statistics.
		{/snippet}
		{#snippet actions()}
			<Toggle
				id="metricsEnabledToggle"
				testId={TestId.OnboardingPageAnalyticsSettingsTelemetryToggle}
				checked={metricsEnabled}
				onclick={() =>
					globalDraftStore.updateAppSettings({
						telemetry: {
							...globalDraftStore.draft.appSettings.telemetry,
							appMetricsEnabled: !metricsEnabled,
						},
					})}
			/>
		{/snippet}
	</CardGroup.Item>

	<CardGroup.Item labelFor="nonAnonMetricsEnabledToggle">
		{#snippet title()}
			Non-anonymous usage metrics
		{/snippet}
		{#snippet caption()}
			Toggle sharing of identifiable usage statistics.
		{/snippet}
		{#snippet actions()}
			<Toggle
				id="nonAnonMetricsEnabledToggle"
				testId={TestId.OnboardingPageAnalyticsSettingsNonAnonymousToggle}
				checked={nonAnonMetricsEnabled}
				onclick={() =>
					globalDraftStore.updateAppSettings({
						telemetry: {
							...globalDraftStore.draft.appSettings.telemetry,
							appNonAnonMetricsEnabled: !nonAnonMetricsEnabled,
						},
					})}
			/>
		{/snippet}
	</CardGroup.Item>
</CardGroup>

<style lang="postcss">
	.analytics-settings__content {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.analytics-settings__text {
		margin-bottom: 10px;
		color: var(--text-2);
	}
</style>
