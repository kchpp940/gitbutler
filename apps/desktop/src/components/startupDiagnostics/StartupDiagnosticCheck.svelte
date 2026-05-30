<script lang="ts">
	import { Icon, InfoMessage, chipToasts } from "@gitbutler/ui";
	import type { DiagnosticCheck, DiagnosticStatus } from "$lib/startupDiagnostics";
	import { BACKEND } from "$lib/backend";
	import { inject } from "@gitbutler/core/context";

	interface Props {
		check: DiagnosticCheck;
		onRerun?: (checkId: string) => void;
	}

	const { check, onRerun }: Props = $props();

	const backend = inject(BACKEND);

	const statusIconMap: Record<DiagnosticStatus, "question" | "spinner" | "tick-circle" | "cross-circle" | "warning"> = {
		pending: "question",
		running: "spinner",
		passed: "tick-circle",
		failed: "cross-circle",
		warning: "warning",
	};

	const statusColorMap: Record<DiagnosticStatus, string> = {
		pending: "var(--text-3)",
		running: "var(--focus-border-default)",
		passed: "var(--text-success)",
		failed: "var(--text-danger)",
		warning: "var(--text-warning)",
	};

	async function handleFix() {
		if (!check.fix) return;

		switch (check.fix.type) {
			case "link":
				if (check.fix.url) {
					await backend.openExternalUrl(check.fix.url);
				}
				break;
			case "command":
				if (check.fix.command) {
					chipToasts.info(`Run in terminal: ${check.fix.command}`);
					navigator.clipboard.writeText(check.fix.command).catch(() => {});
				}
				break;
			case "instructions":
				break;
		}
	}

	function handleRerun() {
		onRerun?.(check.id);
	}
</script>

<div class="check-card" data-status={check.status}>
	<div class="check-header">
		<div class="check-status" class:spinning={check.status === "running"}>
			<Icon name={statusIconMap[check.status]} color={statusColorMap[check.status]} />
		</div>
		<div class="check-info">
			<div class="check-name-row">
				<span class="check-name">{check.name}</span>
				<span class="check-badge environment-badge" data-environment={check.environment}>
					{check.environment}
				</span>
				{#if check.severity === "blocking"}
					<span class="check-badge severity-badge" data-severity="blocking">
						blocking
					</span>
				{/if}
			</div>
			<div class="check-message">{check.message}</div>
		</div>
		{#if check.duration_ms !== undefined}
			<div class="check-duration">{(check.duration_ms / 1000).toFixed(2)}s</div>
		{/if}
	</div>

	{#if check.error}
		<div class="check-details">
			<InfoMessage filled outlined={false} style={check.status === "failed" ? "danger" : "warning"} icon="info">
				{#snippet content()}
					<div class="error-detail">
						{#if check.error?.location}
							<div class="error-location">
								<Icon name="file" />
								<span>{check.error?.location}</span>
							</div>
						{/if}
						{#if check.error?.exit_code !== undefined}
							<div class="error-exit-code">
								<span class="label">Exit code:</span>
								<code>{check.error?.exit_code}</code>
							</div>
						{/if}
						{#if check.error?.message}
							<div class="error-message">{check.error?.message}</div>
						{/if}
						{#if check.error?.raw_output}
							<div class="error-output">
								<div class="label">Raw output:</div>
								<pre>{check.error?.raw_output}</pre>
							</div>
						{/if}
					</div>
				{/snippet}
			</InfoMessage>
		</div>
	{:else if check.details}
		<div class="check-details">
			<InfoMessage filled outlined={false} style={check.status === "failed" ? "danger" : "warning"} icon="info">
				{#snippet content()}
					<pre>{check.details}</pre>
				{/snippet}
			</InfoMessage>
		</div>
	{/if}

	{#if check.fix && (check.status === "failed" || check.status === "warning")}
		<div class="check-fix">
			{#if check.fix.type === "link"}
				<button class="fix-button" onclick={handleFix}>
					<Icon name="open-in-browser" />
					{check.fix.label}
				</button>
			{:else if check.fix.type === "command"}
				<button class="fix-button" onclick={handleFix}>
					<Icon name="copy" />
					{check.fix.label}
				</button>
			{:else if check.fix.type === "instructions"}
				<div class="fix-instructions">
					<div class="fix-label">{check.fix.label}</div>
					{#if check.fix.instructions}
						<div class="fix-text">{check.fix.instructions}</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}

	{#if check.status !== "running" && onRerun}
		<button class="rerun-button" onclick={handleRerun} title="Rerun check">
			<Icon name="refresh" />
		</button>
	{/if}
</div>

<style lang="postcss">
	.check-card {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 16px;
		border-radius: var(--radius-m);
		background-color: var(--bg-2);
		border: 1px solid var(--border-1);
		position: relative;
	}

	.check-header {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.check-status {
		flex-shrink: 0;
		width: 20px;
		height: 20px;

		&.spinning :global(.icon) {
			animation: spin 1s linear infinite;
		}
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.check-info {
		flex: 1;
		min-width: 0;
	}

	.check-name-row {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-bottom: 2px;
	}

	.check-name {
		font-size: 14px;
		font-weight: 600;
		color: var(--text-1);
	}

	.check-badge {
		font-size: 10px;
		font-weight: 500;
		padding: 2px 6px;
		border-radius: var(--radius-s);
		text-transform: uppercase;
		letter-spacing: 0.3px;
	}

	.environment-badge {
		&[data-environment="development"] {
			background-color: var(--bg-3);
			color: var(--text-2);
		}
		&[data-environment="runtime"] {
			background-color: var(--bg-4);
			color: var(--text-1);
		}
	}

	.severity-badge {
		&[data-severity="blocking"] {
			background-color: color-mix(in srgb, var(--text-danger) 15%, var(--bg-2));
			color: var(--text-danger);
		}
	}

	.check-message {
		font-size: 12px;
		color: var(--text-2);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.check-duration {
		flex-shrink: 0;
		font-size: 11px;
		color: var(--text-3);
		font-family: var(--monospace-font);
	}

	.check-details {
		margin-top: 4px;

		& pre {
			margin: 0;
			padding: 8px;
			font-size: 11px;
			font-family: var(--monospace-font);
			white-space: pre-wrap;
			word-break: break-all;
			max-height: 100px;
			overflow-y: auto;
		}
	}

	.error-detail {
		display: flex;
		flex-direction: column;
		gap: 8px;

		.label {
			font-size: 11px;
			color: var(--text-3);
			margin-right: 4px;
		}

		.error-location {
			display: flex;
			align-items: center;
			gap: 4px;
			font-size: 12px;
			color: var(--text-2);
			font-family: var(--monospace-font);
		}

		.error-exit-code {
			display: flex;
			align-items: center;
			font-size: 12px;

			code {
				padding: 2px 6px;
				background-color: var(--bg-3);
				border-radius: var(--radius-s);
				font-family: var(--monospace-font);
			}
		}

		.error-message {
			font-size: 12px;
			color: var(--text-2);
			line-height: 1.4;
		}

		.error-output {
			pre {
				margin: 4px 0 0 0;
				padding: 8px;
				background-color: var(--bg-1);
				border-radius: var(--radius-s);
				font-size: 11px;
				font-family: var(--monospace-font);
				white-space: pre-wrap;
				word-break: break-all;
				max-height: 150px;
				overflow-y: auto;
			}
		}
	}

	.check-fix {
		margin-top: 4px;
	}

	.fix-button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 8px 12px;
		border-radius: var(--radius-s);
		background-color: var(--bg-3);
		border: 1px solid var(--border-2);
		color: var(--text-1);
		font-size: 12px;
		cursor: pointer;
		transition: all 0.15s ease;

		&:hover {
			background-color: var(--bg-4);
			border-color: var(--border-3);
		}
	}

	.fix-instructions {
		padding: 12px;
		border-radius: var(--radius-s);
		background-color: var(--bg-3);
		border: 1px solid var(--border-2);
	}

	.fix-label {
		font-size: 12px;
		font-weight: 600;
		color: var(--text-1);
		margin-bottom: 4px;
	}

	.fix-text {
		font-size: 12px;
		color: var(--text-2);
		line-height: 1.5;
	}

	.rerun-button {
		position: absolute;
		top: 12px;
		right: 12px;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: var(--radius-s);
		background-color: transparent;
		border: none;
		color: var(--text-3);
		cursor: pointer;
		opacity: 0;
		transition: all 0.15s ease;

		.check-card:hover & {
			opacity: 1;
		}

		&:hover {
			background-color: var(--bg-3);
			color: var(--text-1);
		}
	}
</style>
