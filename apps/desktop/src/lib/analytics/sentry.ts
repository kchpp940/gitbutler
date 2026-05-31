import * as Sentry from "@sentry/sveltekit";
import type { EnvironmentProfile } from "$lib/config/environmentProfile";

const { setUser, init } = Sentry;

export function initSentry(profile: EnvironmentProfile) {
	const sentryConfig = profile.analytics.sentry;

	init({
		enabled: sentryConfig.enabled,
		dsn: sentryConfig.dsn,
		environment: sentryConfig.environment,
		tracesSampleRate: sentryConfig.tracesSampleRate,
		tracePropagationTargets: ["localhost", /gitbutler\.com/i],
	});
}

export function setSentryUser(user: { id: number; email?: string; name?: string }) {
	setUser({
		id: user.id.toString(),
		email: user.email,
		username: user.name,
	});
}

export function resetSentry() {
	setUser(null);
}
