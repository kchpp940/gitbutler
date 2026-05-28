import type { TreeChange } from "@gitbutler/but-sdk";
import type { UncommittedService } from "$lib/selection/uncommittedService.svelte";

export type GroupByMode = "directory" | "fileType" | "stack" | "selected" | "none";

export interface FileGroup {
	id: string;
	label: string;
	changes: TreeChange[];
}

const FILE_SORT_CONFIG: Intl.CollatorOptions = {
	numeric: true,
	caseFirst: "lower",
	sensitivity: "base",
} as const;
const FILE_SORT_LOCALE = "en";

function sortChanges(changes: TreeChange[]): TreeChange[] {
	return [...changes].sort((a, b) =>
		a.path.localeCompare(b.path, FILE_SORT_LOCALE, FILE_SORT_CONFIG),
	);
}

export function groupByDirectory(changes: TreeChange[]): FileGroup[] {
	const groups = new Map<string, TreeChange[]>();

	for (const change of changes) {
		const parts = change.path.split("/");
		const groupName = parts.length > 1 ? parts[0] ?? "root" : "root";
		if (!groups.has(groupName)) {
			groups.set(groupName, []);
		}
		groups.get(groupName)!.push(change);
	}

	const result: FileGroup[] = [];
	for (const [name, groupChanges] of groups.entries()) {
		result.push({
			id: `dir-${name}`,
			label: name === "root" ? "Root" : name,
			changes: sortChanges(groupChanges),
		});
	}

	return result.sort((a, b) =>
		a.label.localeCompare(b.label, FILE_SORT_LOCALE, FILE_SORT_CONFIG),
	);
}

function getFileExtension(path: string): string {
	const lastDot = path.lastIndexOf(".");
	if (lastDot === -1 || lastDot === path.length - 1) {
		return "No extension";
	}
	return path.slice(lastDot + 1).toLowerCase();
}

export function groupByFileType(changes: TreeChange[]): FileGroup[] {
	const groups = new Map<string, TreeChange[]>();

	for (const change of changes) {
		const ext = getFileExtension(change.path);
		if (!groups.has(ext)) {
			groups.set(ext, []);
		}
		groups.get(ext)!.push(change);
	}

	const result: FileGroup[] = [];
	for (const [ext, groupChanges] of groups.entries()) {
		result.push({
			id: `type-${ext}`,
			label: ext === "No extension" ? ext : `.${ext}`,
			changes: sortChanges(groupChanges),
		});
	}

	return result.sort((a, b) =>
		a.label.localeCompare(b.label, FILE_SORT_LOCALE, FILE_SORT_CONFIG),
	);
}

export function groupByStack(
	changes: TreeChange[],
	uncommittedService: UncommittedService,
	stackId: string | null,
): FileGroup[] {
	const assigned = new Map<string, TreeChange[]>();
	const unassigned: TreeChange[] = [];

	for (const change of changes) {
		const assignments = uncommittedService.getAssignmentsByPath(stackId, change.path);
		const stackIds = new Set<string>();

		for (const assignment of assignments) {
			if (
				assignment.target?.type === "stack" &&
				assignment.target.subject.stackId !== stackId
			) {
				stackIds.add(assignment.target.subject.stackId);
			}
		}

		if (stackIds.size === 0) {
			unassigned.push(change);
		} else {
			for (const sid of stackIds) {
				if (!assigned.has(sid)) {
					assigned.set(sid, []);
				}
				assigned.get(sid)!.push(change);
			}
		}
	}

	const result: FileGroup[] = [];

	if (unassigned.length > 0) {
		result.push({
			id: "stack-unassigned",
			label: "Unassigned",
			changes: sortChanges(unassigned),
		});
	}

	for (const [sid, groupChanges] of assigned.entries()) {
		result.push({
			id: `stack-${sid}`,
			label: `Stack ${sid.slice(0, 8)}`,
			changes: sortChanges(groupChanges),
		});
	}

	return result;
}

export function groupBySelected(
	changes: TreeChange[],
	uncommittedService: UncommittedService,
	stackId: string | null,
): FileGroup[] {
	const selected: TreeChange[] = [];
	const unselected: TreeChange[] = [];

	for (const change of changes) {
		const status = uncommittedService.fileCheckStatus(stackId, change.path).current;
		if (status === "checked" || status === "indeterminate") {
			selected.push(change);
		} else {
			unselected.push(change);
		}
	}

	const result: FileGroup[] = [];

	if (selected.length > 0) {
		result.push({
			id: "selected-yes",
			label: "Selected",
			changes: sortChanges(selected),
		});
	}

	if (unselected.length > 0) {
		result.push({
			id: "selected-no",
			label: "Not Selected",
			changes: sortChanges(unselected),
		});
	}

	return result;
}

export function groupChanges(
	mode: GroupByMode,
	changes: TreeChange[],
	uncommittedService?: UncommittedService,
	stackId?: string | null,
): FileGroup[] {
	switch (mode) {
		case "directory":
			return groupByDirectory(changes);
		case "fileType":
			return groupByFileType(changes);
		case "stack":
			if (uncommittedService !== undefined) {
				return groupByStack(changes, uncommittedService, stackId ?? null);
			}
			return [{ id: "all", label: "All", changes: sortChanges(changes) }];
		case "selected":
			if (uncommittedService !== undefined) {
				return groupBySelected(changes, uncommittedService, stackId ?? null);
			}
			return [{ id: "all", label: "All", changes: sortChanges(changes) }];
		case "none":
		default:
			return [{ id: "all", label: "All", changes: sortChanges(changes) }];
	}
}

export function getAllChangesFromGroups(groups: FileGroup[]): TreeChange[] {
	return groups.flatMap((g) => g.changes);
}

export function findChangeInGroups(
	groups: FileGroup[],
	path: string,
): { group: FileGroup; change: TreeChange; index: number } | null {
	for (const group of groups) {
		const index = group.changes.findIndex((c) => c.path === path);
		if (index !== -1) {
			return { group, change: group.changes[index]!, index };
		}
	}
	return null;
}
