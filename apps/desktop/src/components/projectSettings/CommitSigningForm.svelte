<script lang="ts">
	import SectionCardDisclaimer from "$components/shared/SectionCardDisclaimer.svelte";
	import SettingsSection from "$components/shared/SettingsSection.svelte";
	import { GIT_SERVICE } from "$lib/git/gitService";
	import { PROJECT_DRAFT_STORE } from "$lib/settings/projectDraftStore";
	import { inject } from "@gitbutler/core/context";
	import {
		Button,
		CardGroup,
		InfoMessage,
		Link,
		Select,
		SelectItem,
		Textbox,
		Toggle,
	} from "@gitbutler/ui";

	const { projectId }: { projectId: string } = $props();

	const gitService = inject(GIT_SERVICE);
	const projectDraftStore = PROJECT_DRAFT_STORE;

	const signing = $derived(projectDraftStore.draft.signing);
	const signCommits = $derived(signing?.signCommits ?? false);
	const signingFormat = $derived(signing?.signingFormat ?? "openpgp");

	const signingFormatOptions = [
		{
			label: "GPG",
			value: "openpgp",
			keyPlaceholder: "ex: 723CCA3AC13CF28D",
			programPlaceholder: "ex: /usr/local/bin/gpg",
		},
		{
			label: "SSH",
			value: "ssh",
			keyPlaceholder: "ex: /Users/bob/.ssh/id_rsa.pub",
			programPlaceholder: "ex: /Applications/1Password.app/Contents/MacOS/op-ssh-sign",
		},
	] as const;

	const selectedOption = $derived(
		signingFormatOptions.find((option) => option.value === signingFormat),
	);
	const keyPlaceholder = $derived(selectedOption?.keyPlaceholder);
	const programPlaceholder = $derived(selectedOption?.programPlaceholder);

	const signingProgram = $derived(
		signingFormat === "openpgp"
			? (signing?.gpgProgram ?? "")
			: (signing?.gpgSshProgram ?? ""),
	);

	let checked = $state(false);
	let loading = $state(true);
	let signCheckResult = $state(false);
	let errorMessage = $state("");

	async function checkSigning() {
		errorMessage = "";
		checked = true;
		loading = true;
		await gitService
			.checkSigningSettings(projectId)
			.then(() => {
				signCheckResult = true;
			})
			.catch((err) => {
				console.error("Error checking signing:", err);
				errorMessage = err.message;
				signCheckResult = false;
			});
		loading = false;
	}

	function setSignCommits(targetState: boolean) {
		projectDraftStore.updateSigningSettings(projectId, { signCommits: targetState });
	}

	function updateSigningFormat(format: string) {
		projectDraftStore.updateSigningSettings(projectId, { signingFormat: format });
	}

	function updateSigningKey(key: string) {
		projectDraftStore.updateSigningSettings(projectId, { signingKey: key });
	}

	function updateSigningProgram(program: string) {
		if (signingFormat === "openpgp") {
			projectDraftStore.updateSigningSettings(projectId, { gpgProgram: program });
		} else {
			projectDraftStore.updateSigningSettings(projectId, { gpgSshProgram: program });
		}
	}

	async function handleSignCommitsClick(event: MouseEvent) {
		await setSignCommits((event.target as HTMLInputElement)?.checked);
	}
</script>

<SettingsSection>
	<CardGroup>
		<CardGroup.Item labelFor="signCommits">
			{#snippet title()}
				Sign commits
			{/snippet}
			{#snippet caption()}
				Use GPG or SSH to sign your commits so they can be verified as authentic.
				<br />
				GitButler will sign commits as per your git configuration, but evaluates
				<code class="code-string">gitbutler.signCommits</code> with priority.
			{/snippet}
			{#snippet actions()}
				<Toggle id="signCommits" checked={signCommits} onclick={handleSignCommitsClick} />
			{/snippet}
		</CardGroup.Item>
	</CardGroup>
	{#if signCommits}
		<CardGroup>
			<CardGroup.Item>
				<Select
					value={signingFormat}
					options={signingFormatOptions}
					wide
					label="Signing format"
					onselect={(value: string) => updateSigningFormat(value)}
				>
					{#snippet itemSnippet({ item, highlighted })}
						<SelectItem selected={item.value === signingFormat} {highlighted}>
							{item.label}
						</SelectItem>
					{/snippet}
				</Select>

				<Textbox
					label="Signing key"
					value={signing?.signingKey ?? ""}
					required
					onchange={(value: string) => updateSigningKey(value)}
					placeholder={keyPlaceholder}
				/>

				<Textbox
					label="Signing program (optional)"
					value={signingProgram}
					onchange={(value: string) => updateSigningProgram(value)}
					placeholder={programPlaceholder}
				/>

				{#if checked}
					<InfoMessage
						style={loading ? "info" : signCheckResult ? "success" : "danger"}
						filled
						outlined={false}
						error={errorMessage}
					>
						{#snippet title()}
							{#if loading}
								<p>Checking signing</p>
							{:else if signCheckResult}
								<p>Signing is working correctly</p>
							{:else}
								<p>Signing is not working correctly</p>
							{/if}
						{/snippet}
					</InfoMessage>
				{/if}

				<Button style="pop" wide icon="tick" onclick={checkSigning}>
					{#if !checked}
						Test signing
					{:else}
						Re-test signing
					{/if}
				</Button>
				<SectionCardDisclaimer>
					Signing commits can allow other people to verify your commits if you publish the public
					version of your signing key.
					<Link href="https://docs.gitbutler.com/features/virtual-branches/signing-commits"
						>Read more</Link
					> about commit signing and verification.
				</SectionCardDisclaimer>
			</CardGroup.Item>
		</CardGroup>
	{/if}
</SettingsSection>
