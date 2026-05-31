import { persistSwallowGitHubOrgAuthErrors } from "$lib/config/config";
import { showToast, type Toast } from "$lib/notifications/toasts";
import type { DiagnosticEvent } from "$lib/diagnostics/types";
import { isGitHubOrgAuthError } from "$lib/error/parser";
import { fromUnknown } from "$lib/diagnostics/service";

type ExtraAction = NonNullable<Toast["extraAction"]>;

export function showErrorFromDiagnostic(event: DiagnosticEvent, extraAction?: ExtraAction, id?: string) {
	if (event.ignored || event.silent || !event.userVisible) {
		return;
	}

	const offerToIgnore = isGitHubOrgAuthError(event.title);
	const actualExtraAction =
		extraAction ??
		(offerToIgnore
			? {
					label: "Don't show this again",
					onClick: () => {
						persistSwallowGitHubOrgAuthErrors(true);
					},
				}
			: undefined);

	showToast({
		id,
		title: event.title,
		message: event.description,
		error: event.message,
		style: event.level === "warn" ? "warning" : "danger",
		extraAction: actualExtraAction,
	});
}

export function showError(title: string, error: unknown, extraAction?: ExtraAction, id?: string) {
	const event = fromUnknown("svelte:error", error, { title, skipToast: true });
	showErrorFromDiagnostic(event, extraAction, id);
}
