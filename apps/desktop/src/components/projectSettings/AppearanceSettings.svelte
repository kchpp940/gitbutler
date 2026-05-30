<script lang="ts">
	import ThemeSelector from "$components/projectSettings/ThemeSelector.svelte";
	import { GLOBAL_DRAFT_STORE } from "$lib/settings/globalDraftStore";
	import { UI_STATE } from "$lib/state/uiState.svelte";
	import { inject } from "@gitbutler/core/context";
	import {
		CardGroup,
		HunkDiff,
		RadioButton,
		Select,
		SelectItem,
		Textbox,
		Toggle,
	} from "@gitbutler/ui";
	import { LIGHT_THEMES, DARK_THEMES, setSyntaxThemes } from "@gitbutler/ui/utils/shikiHighlighter";
	import type { ScrollbarVisilitySettings } from "@gitbutler/ui";

	const globalDraftStore = GLOBAL_DRAFT_STORE;
	const uiState = inject(UI_STATE);

	$effect(() => {
		setSyntaxThemes(
			globalDraftStore.draft.uiPreferences.syntaxThemeLight ?? "github-light-default",
			globalDraftStore.draft.uiPreferences.syntaxThemeDark ?? "github-dark-default",
		);
	});

	const diff = `@@ -56,10 +56,10 @@
			// Diff example
			projectName={project.title}
			{remoteBranches}
			on:branchSelected={async (e) => {
-				selectedBranch = e.detail;
-				if ($platformName === 'win32') {
+				if ($platformName === 'win64' && $userSettings.enableAdvancedFeatures) {
+					// Enhanced platform detection with feature flags
					setTarget();
				}
			}}`;

	function onScrollbarFormChange(form: HTMLFormElement) {
		const formData = new FormData(form);
		const selectedScrollbarVisibility = formData.get(
			"scrollBarVisibilityType",
		) as ScrollbarVisilitySettings;

		globalDraftStore.updateUIPreferences({ scrollbarVisibilityState: selectedScrollbarVisibility });
	}
</script>

<CardGroup.Item standalone>
	{#snippet title()}
		Theme
	{/snippet}
	<ThemeSelector
		currentTheme={globalDraftStore.draft.uiPreferences.theme ?? "system"}
		onThemeChange={(theme) => globalDraftStore.updateUIPreferences({ theme })}
	/>
</CardGroup.Item>

<CardGroup.Item alignment="center" standalone>
	{#snippet title()}
		Default file list mode
	{/snippet}
	{#snippet caption()}
		Set the default file list view (can be changed per location).
	{/snippet}
	{#snippet actions()}
		<Select
			maxWidth={120}
			value={globalDraftStore.draft.uiPreferences.defaultFileListMode ?? "tree"}
			options={[
				{ label: "List view", value: "list" },
				{ label: "Tree view", value: "tree" },
			]}
			onselect={(value) => {
				globalDraftStore.updateUIPreferences({
					defaultFileListMode: value as "tree" | "list",
				});
			}}
		>
			{#snippet itemSnippet({ item, highlighted })}
				<SelectItem
					selected={item.value === globalDraftStore.draft.uiPreferences.defaultFileListMode}
					{highlighted}
				>
					{item.label}
				</SelectItem>
			{/snippet}
		</Select>
	{/snippet}
</CardGroup.Item>

<CardGroup.Item labelFor="pathFirst" standalone>
	{#snippet title()}
		File path first
	{/snippet}
	{#snippet caption()}
		Display the full file path before the file name in file lists.
	{/snippet}
	{#snippet actions()}
		<Toggle
			id="pathFirst"
			checked={globalDraftStore.draft.uiPreferences.pathFirst ?? false}
			onclick={() => {
				globalDraftStore.updateUIPreferences({
					pathFirst: !globalDraftStore.draft.uiPreferences.pathFirst,
				});
			}}
		/>
	{/snippet}
</CardGroup.Item>

<CardGroup>
	<CardGroup.Item labelFor="allInOneDiff">
		{#snippet title()}
			All-in-one diff
		{/snippet}
		{#snippet caption()}
			Show a scrollable list of all file diffs instead of only the selected file's diff.
		{/snippet}
		{#snippet actions()}
			<Toggle
				id="allInOneDiff"
				checked={globalDraftStore.draft.uiPreferences.allInOneDiff ?? false}
				onclick={() => {
					globalDraftStore.updateUIPreferences({
						allInOneDiff: !globalDraftStore.draft.uiPreferences.allInOneDiff,
					});
				}}
			/>
		{/snippet}
	</CardGroup.Item>

	{#if globalDraftStore.draft.uiPreferences.allInOneDiff}
		<CardGroup.Item labelFor="highlightDiffs">
			{#snippet title()}
				Highlight active diff
			{/snippet}
			{#snippet caption()}
				Highlight the currently selected file's diff in the all-in-one diff view.
			{/snippet}
			{#snippet actions()}
				<Toggle
					id="highlightDiffs"
					checked={globalDraftStore.draft.uiPreferences.highlightDiffs ?? true}
					onclick={() => {
						globalDraftStore.updateUIPreferences({
							highlightDiffs: !globalDraftStore.draft.uiPreferences.highlightDiffs,
						});
					}}
				/>
			{/snippet}
		</CardGroup.Item>
	{/if}
</CardGroup>

<CardGroup>
	<CardGroup.Item alignment="center">
		{#snippet title()}
			Diff preview
		{/snippet}

		<HunkDiff
			filePath="test.tsx"
			hunkStr={diff}
			{...uiState.pick(
				"tabSize",
				"wrapText",
				"diffFont",
				"diffLigatures",
				"strongContrast",
				"colorBlindFriendly",
				"inlineUnifiedDiffs",
			)}
		/>
	</CardGroup.Item>

	<CardGroup.Item alignment="center">
		{#snippet title()}
			Syntax theme (light)
		{/snippet}
		{#snippet caption()}
			Color scheme used for syntax highlighting when the app is in light mode.
		{/snippet}
		{#snippet actions()}
			<Select
				maxWidth={200}
				value={globalDraftStore.draft.uiPreferences.syntaxThemeLight ?? "github-light-default"}
				options={LIGHT_THEMES}
				onselect={(value) => {
					globalDraftStore.updateUIPreferences({ syntaxThemeLight: value });
				}}
			>
				{#snippet itemSnippet({ item, highlighted })}
					<SelectItem
						selected={item.value === globalDraftStore.draft.uiPreferences.syntaxThemeLight}
						{highlighted}
					>
						{item.label}
					</SelectItem>
				{/snippet}
			</Select>
		{/snippet}
	</CardGroup.Item>

	<CardGroup.Item alignment="center">
		{#snippet title()}
			Syntax theme (dark)
		{/snippet}
		{#snippet caption()}
			Color scheme used for syntax highlighting when the app is in dark mode.
		{/snippet}
		{#snippet actions()}
			<Select
				maxWidth={200}
				value={globalDraftStore.draft.uiPreferences.syntaxThemeDark ?? "github-dark-default"}
				options={DARK_THEMES}
				onselect={(value) => {
					globalDraftStore.updateUIPreferences({ syntaxThemeDark: value });
				}}
			>
				{#snippet itemSnippet({ item, highlighted })}
					<SelectItem
						selected={item.value === globalDraftStore.draft.uiPreferences.syntaxThemeDark}
						{highlighted}
					>
						{item.label}
					</SelectItem>
				{/snippet}
			</Select>
		{/snippet}
	</CardGroup.Item>

	<CardGroup.Item>
		{#snippet title()}
			Font family
		{/snippet}
		{#snippet caption()}
			Sets the font for the diff view. The first font name is the default, others are fallbacks.
		{/snippet}

		<Textbox
			wide
			value={globalDraftStore.draft.uiPreferences.diffFont ?? "JetBrains Mono, Menlo, monospace"}
			required
			onchange={(value: string) => {
				globalDraftStore.updateUIPreferences({ diffFont: value });
			}}
		/>
	</CardGroup.Item>

	<CardGroup.Item labelFor="allowDiffLigatures">
		{#snippet title()}
			Allow font ligatures
		{/snippet}
		{#snippet actions()}
			<Toggle
				id="allowDiffLigatures"
				checked={globalDraftStore.draft.uiPreferences.diffLigatures ?? false}
				onclick={() => {
					globalDraftStore.updateUIPreferences({
						diffLigatures: !globalDraftStore.draft.uiPreferences.diffLigatures,
					});
				}}
			/>
		{/snippet}
	</CardGroup.Item>

	<CardGroup.Item alignment="center">
		{#snippet title()}
			Tab size
		{/snippet}
		{#snippet caption()}
			Number of spaces per tab in the diff view.
		{/snippet}

		{#snippet actions()}
			<Textbox
				type="number"
				width={100}
				textAlign="center"
				value={String(globalDraftStore.draft.uiPreferences.tabSize ?? 4)}
				minVal={1}
				maxVal={8}
				showCountActions
				onchange={(value: string) => {
					globalDraftStore.updateUIPreferences({
						tabSize: parseInt(value) || globalDraftStore.draft.uiPreferences.tabSize || 4,
					});
				}}
				placeholder={String(globalDraftStore.draft.uiPreferences.tabSize ?? 4)}
			/>
		{/snippet}
	</CardGroup.Item>

	<CardGroup.Item labelFor="wrapText">
		{#snippet title()}
			Soft wrap
		{/snippet}
		{#snippet caption()}
			Soft wrap long lines in the diff view to fit within the viewport.
		{/snippet}

		{#snippet actions()}
			<Toggle
				id="wrapText"
				checked={globalDraftStore.draft.uiPreferences.wrapText ?? false}
				onclick={() => {
					globalDraftStore.updateUIPreferences({
						wrapText: !globalDraftStore.draft.uiPreferences.wrapText,
					});
				}}
			/>
		{/snippet}
	</CardGroup.Item>

	<CardGroup.Item labelFor="strongContrast">
		{#snippet title()}
			Strong contrast
		{/snippet}
		{#snippet caption()}
			Use stronger contrast for added, deleted, and context lines in diffs.
		{/snippet}
		{#snippet actions()}
			<Toggle
				id="strongContrast"
				checked={globalDraftStore.draft.uiPreferences.strongContrast ?? false}
				onclick={() => {
					globalDraftStore.updateUIPreferences({
						strongContrast: !globalDraftStore.draft.uiPreferences.strongContrast,
					});
				}}
			/>
		{/snippet}
	</CardGroup.Item>

	<CardGroup.Item labelFor="colorBlindFriendly">
		{#snippet title()}
			Color blind-friendly colors
		{/snippet}
		{#snippet caption()}
			Use blue and orange colors instead of green and red for better
			<br />
			accessibility with color vision deficiency.
		{/snippet}
		{#snippet actions()}
			<Toggle
				id="colorBlindFriendly"
				checked={globalDraftStore.draft.uiPreferences.colorBlindFriendly ?? false}
				onclick={() => {
					globalDraftStore.updateUIPreferences({
						colorBlindFriendly: !globalDraftStore.draft.uiPreferences.colorBlindFriendly,
					});
				}}
			/>
		{/snippet}
	</CardGroup.Item>

	<CardGroup.Item labelFor="inlineUnifiedDiffs">
		{#snippet title()}
			Display word diffs inline
		{/snippet}
		{#snippet caption()}
			Instead of separate lines for removals and additions, this feature shows a single line with
			both added and removed words highlighted.
		{/snippet}
		{#snippet actions()}
			<Toggle
				id="inlineUnifiedDiffs"
				checked={globalDraftStore.draft.uiPreferences.inlineUnifiedDiffs ?? false}
				onclick={() => {
					globalDraftStore.updateUIPreferences({
						inlineUnifiedDiffs: !globalDraftStore.draft.uiPreferences.inlineUnifiedDiffs,
					});
				}}
			/>
		{/snippet}
	</CardGroup.Item>

	<CardGroup.Item labelFor="svgAsImage">
		{#snippet title()}
			Preview SVG files as images
		{/snippet}
		{#snippet caption()}
			Show SVG file changes as an image diff instead of a code diff.
		{/snippet}
		{#snippet actions()}
			<Toggle
				id="svgAsImage"
				checked={globalDraftStore.draft.uiPreferences.svgAsImage ?? false}
				onclick={() => {
					globalDraftStore.updateUIPreferences({
						svgAsImage: !globalDraftStore.draft.uiPreferences.svgAsImage,
					});
				}}
			/>
		{/snippet}
	</CardGroup.Item>
</CardGroup>

<CardGroup>
	<form class="stack-v" onchange={(e) => onScrollbarFormChange(e.currentTarget)}>
		<CardGroup.Item labelFor="scrollbar-on-scroll">
			{#snippet title()}
				Scrollbar-On-Scroll
			{/snippet}
			{#snippet caption()}
				Only show the scrollbar when you are scrolling.
			{/snippet}
			{#snippet actions()}
				<RadioButton
					name="scrollBarVisibilityType"
					value="scroll"
					id="scrollbar-on-scroll"
					checked={globalDraftStore.draft.uiPreferences.scrollbarVisibilityState === "scroll"}
				/>
			{/snippet}
		</CardGroup.Item>

		<CardGroup.Item labelFor="scrollbar-on-hover">
			{#snippet title()}
				Scrollbar-On-Hover
			{/snippet}
			{#snippet caption()}
				Show the scrollbar only when you hover over the scrollable area.
			{/snippet}
			{#snippet actions()}
				<RadioButton
					name="scrollBarVisibilityType"
					value="hover"
					id="scrollbar-on-hover"
					checked={globalDraftStore.draft.uiPreferences.scrollbarVisibilityState === "hover"}
				/>
			{/snippet}
		</CardGroup.Item>

		<CardGroup.Item labelFor="scrollbar-always">
			{#snippet title()}
				Always show scrollbar
			{/snippet}
			{#snippet actions()}
				<RadioButton
					name="scrollBarVisibilityType"
					value="always"
					id="scrollbar-always"
					checked={globalDraftStore.draft.uiPreferences.scrollbarVisibilityState === "always"}
				/>
			{/snippet}
		</CardGroup.Item>
	</form>
</CardGroup>
