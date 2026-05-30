import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Mock Svelte context API for non-component tests
/** @type {Map<any, any>} */
const contextMap = new Map();

vi.mock("svelte", async () => {
	const actual = await vi.importActual("svelte");
	return {
		...actual,
		setContext: (/** @type {any} */ key, /** @type {any} */ value) => {
			contextMap.set(key, value);
		},
		getContext: (/** @type {any} */ key) => {
			return contextMap.get(key);
		},
		hasContext: (/** @type {any} */ key) => contextMap.has(key),
	};
});

// Mock SvelteKit $app/environment
vi.mock("$app/environment", () => ({
	dev: false,
	browser: true,
	building: false,
	version: "test-version",
}));

// Mock logError to prevent console noise in tests
vi.mock("$lib/error/logError", () => ({
	logError: vi.fn(),
}));

// https://github.com/testing-library/svelte-testing-library/issues/284#issuecomment-2082726160
Element.prototype.animate = () => ({
	// @ts-expect-error `Animation` execpted
	finished: Promise.resolve(),
	cancel: () => {},
	finish: () => {},
});
