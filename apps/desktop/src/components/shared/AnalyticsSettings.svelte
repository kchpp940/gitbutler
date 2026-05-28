<script lang="ts">
	import { SETTINGS_SERVICE } from "$lib/settings/appSettings";
	import { inject } from "@gitbutler/core/context";
	import { CardGroup, Link, TestId, Toggle } from "@gitbutler/ui";
	import { bindGeneralField } from "$lib/settings/settingsDraft";

	const settingsService = inject(SETTINGS_SERVICE);
	const appSettings = $derived(settingsService.appSettings);

	const errorReporting = bindGeneralField<boolean>(
		"telemetryEnabled",
		() => $appSettings?.telemetry.appErrorReportingEnabled ?? false,
		(v) => settingsService.updateTelemetry({ appErrorReportingEnabled: v }),
	);

	const metrics = bindGeneralField<boolean>(
		"telemetryMetricsEnabled",
		() => $appSettings?.telemetry.appMetricsEnabled ?? false,
		(v) => settingsService.updateTelemetry({ appMetricsEnabled: v }),
	);

	const nonAnonMetrics = bindGeneralField<boolean>(
		"telemetryNonAnonMetricsEnabled",
		() => $appSettings?.telemetry.appNonAnonMetricsEnabled ?? false,
		(v) => settingsService.updateTelemetry({ appNonAnonMetricsEnabled: v }),
	);
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
				checked={errorReporting.current}
				onclick={() => errorReporting.set(!errorReporting.current)}
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
				checked={metrics.current}
				onclick={() => metrics.set(!metrics.current)}
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
				checked={nonAnonMetrics.current}
				onclick={() => nonAnonMetrics.set(!nonAnonMetrics.current)}
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
