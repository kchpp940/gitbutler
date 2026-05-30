<script lang="ts">
	import { Icon } from "@gitbutler/ui";
	import type { AppTheme } from "$lib/state/uiState.svelte";

	interface Props {
		currentTheme: AppTheme;
		onThemeChange: (theme: AppTheme) => void;
	}

	const { currentTheme, onThemeChange }: Props = $props();

	const themes: { name: string; value: AppTheme; preview: string }[] = [
		{
			name: "Light",
			value: "light",
			preview: "/images/theme-previews/light.svg",
		},
		{
			name: "Dark",
			value: "dark",
			preview: "/images/theme-previews/dark.svg",
		},
		{
			name: "System preference",
			value: "system",
			preview: "/images/theme-previews/system.svg",
		},
	];
</script>

<fieldset class="cards-group">
	{#each themes as theme}
		<label
			class="theme-card"
			class:selected={theme.value === currentTheme}
			for="theme-{theme.value}"
		>
			<input
				class="hidden-input"
				type="radio"
				id="theme-{theme.value}"
				value={theme.value}
				checked={theme.value === currentTheme}
				onchange={() => onThemeChange(theme.value)}
			/>
			<div class="theme-card__preview">
				<i class="theme-card__icon text-success"><Icon name="tick-circle" size={16} /></i>
				<img src={theme.preview} alt="" aria-hidden="true" />
			</div>
			<div class="theme-card__label">{theme.name}</div>
		</label>
	{/each}
</fieldset>

<style>
	.cards-group {
		display: flex;
		flex-wrap: wrap;
		margin: 0;
		padding: 0;
		gap: 12px;
		border: none;
	}

	.theme-card {
		display: flex;
		position: relative;
		flex-direction: column;
		gap: 10px;
		cursor: pointer;
	}

	.hidden-input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.theme-card__preview {
		position: relative;
		width: 140px;
		height: 90px;
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: 12px;
		transition: border-color 100ms ease;
	}

	.theme-card:hover .theme-card__preview {
		border-color: var(--border-hover);
	}

	.theme-card.selected .theme-card__preview {
		border-color: var(--accent);
	}

	.theme-card__icon {
		z-index: 1;
		position: absolute;
		top: 6px;
		right: 6px;
	}

	.theme-card__preview img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.theme-card__label {
		font-weight: 500;
		font-size: 12px;
		text-align: center;
	}
</style>
