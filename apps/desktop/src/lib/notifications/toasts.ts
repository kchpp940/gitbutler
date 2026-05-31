import { writable, type Writable } from "svelte/store";
import type { MessageStyle } from "@gitbutler/ui";
import { fromUnknown, emitDiagnostic } from "$lib/diagnostics/service";
import type { DiagnosticLevel } from "$lib/diagnostics/types";

type ExtraAction = {
	label: string;
	testId?: string;
	onClick: (dismiss: () => void) => void;
};

export interface Toast {
	id?: string;
	testId?: string;
	message?: string;
	error?: any;
	title?: string;
	style?: MessageStyle;
	extraAction?: ExtraAction;
}

export const toastStore: Writable<Toast[]> = writable([]);

let idCounter = 0;

export function showToast(toast: Toast) {
	const level: DiagnosticLevel =
		toast.style === "danger" ? "error" : toast.style === "warning" ? "warn" : "info";

	const event = fromUnknown(
		"ui:toast",
		toast.error ?? toast.message ?? toast.title ?? "Notification",
		{
			title: toast.title,
			context: { testId: toast.testId },
			skipToast: true,
			userVisible: true,
			level,
		},
	);
	emitDiagnostic(event);

	toast.message = toast.message?.replace(/^ */gm, "");
	if (!toast.id) {
		toast = { ...toast, id: `${idCounter++}` };
	}
	toastStore.update((items) => [
		...items.filter((t) => toast.id === undefined || t.id !== toast.id),
		toast,
	]);
}

export function showInfo(title: string, message: string, extraAction?: ExtraAction) {
	showToast({ title, message, style: "info", extraAction });
}

export function showWarning(title: string, message: string, extraAction?: ExtraAction) {
	showToast({ title, message, style: "warning", extraAction });
}

export function dismissToast(messageId: string | undefined) {
	if (!messageId) return;
	toastStore.update((items) => items.filter((m) => m.id !== messageId));
}
