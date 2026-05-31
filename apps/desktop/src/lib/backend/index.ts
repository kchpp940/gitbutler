import Tauri, { tauriLogErrorToFile, tauriPathSeparator } from "$lib/backend/tauri";
import Web, { webLogErrorToFile, webPathSeparator } from "$lib/backend/web";
import { InjectionToken } from "@gitbutler/core/context";
import type { EnvironmentProfile } from "$lib/config/environmentProfile";
import type { IBackend } from "$lib/backend/backend";

export const BACKEND = new InjectionToken<IBackend>("Backend");

export function createBackendFromProfile(profile: EnvironmentProfile): IBackend {
	if (profile.buildTarget === "web") {
		return new Web(profile);
	}
	return new Tauri(profile);
}

export function pathSeparatorFromProfile(profile: EnvironmentProfile): string {
	if (profile.buildTarget === "web") {
		return webPathSeparator();
	}
	return tauriPathSeparator();
}

export function logErrorToFileFromProfile(profile: EnvironmentProfile, error: string) {
	if (profile.buildTarget === "web") {
		webLogErrorToFile(error);
		return;
	}

	tauriLogErrorToFile(error);
}

export function isBackend(something: unknown): something is IBackend {
	return (
		typeof something === "object" &&
		something !== null &&
		(something instanceof Tauri || something instanceof Web)
	);
}

export * from "$lib/backend/backend";
