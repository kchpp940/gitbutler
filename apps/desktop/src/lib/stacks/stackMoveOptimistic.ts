import {
	stackAdapter,
	commitAdapter,
	type WorkspaceDetails,
} from "$lib/stacks/headInfoAdapters";
import type { InsertSide, RelativeTo, Commit, Stack } from "@gitbutler/but-sdk";
import { isDefined } from "@gitbutler/ui/utils/typeguards";

export type CommitMoveIntent = {
	kind: "commit";
	projectId: string;
	subjectCommitIds: string[];
	relativeTo: RelativeTo;
	side: InsertSide;
	sourceStackId?: string;
	sourceBranchName?: string;
};

export type StackReorderIntent = {
	kind: "stack";
	projectId: string;
	orderedStackIds: string[];
};

export type MoveIntent = CommitMoveIntent | StackReorderIntent;

export type CommitMoveContext = {
	kind: "commit";
	sourceStackId: string | null;
	sourceBranchName: string | null;
	targetStackId: string | null;
	targetBranchName: string | null;
	targetCommitId: string | null;
	isTargetTop: boolean;
	side: InsertSide;
	subjectCommitIds: string[];
};

export type StackReorderContext = {
	kind: "stack";
	orderedStackIds: string[];
	originalOrder: string[];
};

export type MoveContext = CommitMoveContext | StackReorderContext;

function parseCommitMoveIntent(
	intent: CommitMoveIntent,
	workspace: WorkspaceDetails,
): CommitMoveContext {
	const { relativeTo, side, subjectCommitIds, sourceStackId, sourceBranchName } =
		intent;

	let resolvedSourceStackId: string | null = sourceStackId ?? null;
	let resolvedSourceBranchName: string | null = sourceBranchName ?? null;

	if (!resolvedSourceStackId || !resolvedSourceBranchName) {
		for (const [stackId, details] of Object.entries(workspace.stackDetails)) {
			for (const segment of details.segments) {
				const hasCommit = subjectCommitIds.some((cid) =>
					segment.commits.some((c) => c.id === cid),
				);
				if (hasCommit) {
					resolvedSourceStackId = stackId;
					resolvedSourceBranchName = segment.refName?.displayName ?? null;
					break;
				}
			}
			if (resolvedSourceStackId) break;
		}
	}

	let targetStackId: string | null = null;
	let targetBranchName: string | null = null;
	let targetCommitId: string | null = null;
	let isTargetTop = false;

	if (relativeTo.type === "reference") {
		const refName = relativeTo.subject.startsWith("refs/heads/")
			? relativeTo.subject.slice("refs/heads/".length)
			: relativeTo.subject;
		targetBranchName = refName;
		isTargetTop = true;

		for (const [stackId, details] of Object.entries(workspace.stackDetails)) {
			const hasBranch = details.segments.some(
				(s) => s.refName?.displayName === refName,
			);
			if (hasBranch) {
				targetStackId = stackId;
				break;
			}
		}
	} else {
		targetCommitId = relativeTo.subject;

		for (const [stackId, details] of Object.entries(workspace.stackDetails)) {
			for (const segment of details.segments) {
				const hasCommit = segment.commits.some((c) => c.id === targetCommitId);
				if (hasCommit) {
					targetStackId = stackId;
					targetBranchName = segment.refName?.displayName ?? null;
					break;
				}
			}
			if (targetStackId) break;
		}
	}

	return {
		kind: "commit",
		sourceStackId: resolvedSourceStackId,
		sourceBranchName: resolvedSourceBranchName,
		targetStackId,
		targetBranchName,
		targetCommitId,
		isTargetTop,
		side,
		subjectCommitIds,
	};
}

function parseStackReorderIntent(
	intent: StackReorderIntent,
	workspace: WorkspaceDetails,
): StackReorderContext {
	const originalOrder = stackAdapter
		.getSelectors()
		.selectAll(workspace.stacks)
		.map((s) => s.id)
		.filter(isDefined);

	return {
		kind: "stack",
		orderedStackIds: intent.orderedStackIds,
		originalOrder,
	};
}

export function parseMoveIntent(
	intent: MoveIntent,
	workspace: WorkspaceDetails,
): MoveContext {
	if (intent.kind === "commit") {
		return parseCommitMoveIntent(intent, workspace);
	} else {
		return parseStackReorderIntent(intent, workspace);
	}
}

function cloneWorkspace(workspace: WorkspaceDetails): WorkspaceDetails {
	return {
		stacks: stackAdapter.addMany(
			stackAdapter.getInitialState(),
			stackAdapter.getSelectors().selectAll(workspace.stacks),
		),
		stackDetails: Object.fromEntries(
			Object.entries(workspace.stackDetails).map(([id, details]) => [
				id,
				{
					stack: { ...details.stack },
					segments: details.segments.map((s) => ({
						...s,
						commits: [...s.commits],
					})),
					commits: commitAdapter.addMany(
						commitAdapter.getInitialState(),
						commitAdapter.getSelectors().selectAll(details.commits),
					),
					upstreamCommits: { ...details.upstreamCommits },
				},
			]),
		),
	};
}

function applyCommitMove(
	workspace: WorkspaceDetails,
	ctx: CommitMoveContext,
): WorkspaceDetails {
	if (!ctx.sourceStackId || !ctx.targetStackId) {
		return workspace;
	}

	const next = cloneWorkspace(workspace);

	const sourceDetails = next.stackDetails[ctx.sourceStackId];
	const targetDetails = next.stackDetails[ctx.targetStackId];

	if (!sourceDetails || !targetDetails) {
		return workspace;
	}

	let movingCommits: Commit[] = [];

	if (ctx.sourceBranchName) {
		const sourceSegment = sourceDetails.segments.find(
			(s) => s.refName?.displayName === ctx.sourceBranchName,
		);
		if (sourceSegment) {
			movingCommits = sourceSegment.commits.filter((c) =>
				ctx.subjectCommitIds.includes(c.id),
			);
			sourceSegment.commits = sourceSegment.commits.filter(
				(c) => !ctx.subjectCommitIds.includes(c.id),
			);
		}
	}

	if (movingCommits.length > 0 && ctx.targetBranchName) {
		const targetSegment = targetDetails.segments.find(
			(s) => s.refName?.displayName === ctx.targetBranchName,
		);
		if (targetSegment) {
			const existingCommits = [...targetSegment.commits];

			if (ctx.isTargetTop || (ctx.side === "below" && !ctx.targetCommitId)) {
				targetSegment.commits = [...movingCommits, ...existingCommits];
			} else {
				const targetIndex = existingCommits.findIndex(
					(c) => c.id === ctx.targetCommitId,
				);
				if (targetIndex === -1) {
					targetSegment.commits = [...movingCommits, ...existingCommits];
				} else if (ctx.side === "below") {
					targetSegment.commits = [
						...existingCommits.slice(0, targetIndex + 1),
						...movingCommits,
						...existingCommits.slice(targetIndex + 1),
					];
				} else {
					targetSegment.commits = [
						...existingCommits.slice(0, targetIndex),
						...movingCommits,
						...existingCommits.slice(targetIndex),
					];
				}
			}
		}
	}

	for (const details of Object.values(next.stackDetails)) {
		const allCommits = details.segments.flatMap((s) => s.commits);
		details.commits = commitAdapter.addMany(
			commitAdapter.getInitialState(),
			allCommits,
		);
	}

	return next;
}

function applyStackReorder(
	workspace: WorkspaceDetails,
	ctx: StackReorderContext,
): WorkspaceDetails {
	const next = cloneWorkspace(workspace);
	const stacks = stackAdapter.getSelectors().selectAll(next.stacks);

	const orderedStacks = ctx.orderedStackIds
		.map((id) => stacks.find((s) => s.id === id))
		.filter(isDefined);

	const unorderedStacks = stacks.filter(
		(s) => !ctx.orderedStackIds.includes(s.id ?? ""),
	);

	const finalStacks = [...orderedStacks, ...unorderedStacks];

	next.stacks = stackAdapter.setAll(stackAdapter.getInitialState(), finalStacks);

	return next;
}

export function applyMoveResult(
	workspace: WorkspaceDetails,
	intent: MoveIntent,
): WorkspaceDetails {
	const ctx = parseMoveIntent(intent, workspace);
	if (ctx.kind === "commit") {
		return applyCommitMove(workspace, ctx);
	} else {
		return applyStackReorder(workspace, ctx);
	}
}

export function validatePlacement(
	workspace: WorkspaceDetails,
	ctx: MoveContext,
): boolean {
	if (ctx.kind === "commit") {
		return (
			ctx.sourceStackId !== null &&
			ctx.targetStackId !== null &&
			ctx.sourceBranchName !== null &&
			ctx.targetBranchName !== null
		);
	} else {
		return ctx.orderedStackIds.length > 0;
	}
}

export function isSamePositionCommitMove(
	ctx: CommitMoveContext,
	workspace: WorkspaceDetails,
): boolean {
	if (ctx.sourceStackId !== ctx.targetStackId) return false;
	if (ctx.sourceBranchName !== ctx.targetBranchName) return false;
	if (ctx.isTargetTop) return false;
	if (!ctx.targetCommitId) return false;

	const sourceDetails = workspace.stackDetails[ctx.sourceStackId];
	if (!sourceDetails) return true;

	const sourceSegment = sourceDetails.segments.find(
		(s) => s.refName?.displayName === ctx.sourceBranchName,
	);
	if (!sourceSegment) return true;

	for (const subjectId of ctx.subjectCommitIds) {
		const subjectIndex = sourceSegment.commits.findIndex((c) => c.id === subjectId);
		const targetIndex = sourceSegment.commits.findIndex((c) => c.id === ctx.targetCommitId);
		if (subjectIndex === -1 || targetIndex === -1) return true;

		if (ctx.side === "below") {
			if (subjectIndex === targetIndex - 1) return true;
		} else {
			if (subjectIndex === targetIndex + 1) return true;
		}
	}

	return false;
}

export function isNoopStackReorder(
	ctx: StackReorderContext,
): boolean {
	if (ctx.orderedStackIds.length !== ctx.originalOrder.length) return false;
	return ctx.orderedStackIds.every((id, i) => id === ctx.originalOrder[i]);
}

export function validateMoveIntent(
	workspace: WorkspaceDetails,
	intent: MoveIntent,
): { valid: boolean; reason?: string } {
	const ctx = parseMoveIntent(intent, workspace);

	if (!validatePlacement(workspace, ctx)) {
		return { valid: false, reason: "Invalid placement" };
	}

	if (ctx.kind === "commit") {
		const sourceDetails = workspace.stackDetails[ctx.sourceStackId!];
		if (!sourceDetails) {
			return { valid: false, reason: "Source stack not found" };
		}

		const targetDetails = workspace.stackDetails[ctx.targetStackId!];
		if (!targetDetails) {
			return { valid: false, reason: "Target stack not found" };
		}

		const sourceSegment = sourceDetails.segments.find(
			(s) => s.refName?.displayName === ctx.sourceBranchName,
		);
		if (!sourceSegment) {
			return { valid: false, reason: "Source branch not found" };
		}

		const hasAllCommits = ctx.subjectCommitIds.every((cid) =>
			sourceSegment.commits.some((c) => c.id === cid),
		);
		if (!hasAllCommits) {
			return { valid: false, reason: "Some commits not found in source branch" };
		}

		if (isSamePositionCommitMove(ctx, workspace)) {
			return { valid: false, reason: "Commit already at target position" };
		}
	} else {
		if (isNoopStackReorder(ctx)) {
			return { valid: false, reason: "Stack order unchanged" };
		}

		const allStacksExist = ctx.orderedStackIds.every(
			(id) => workspace.stackDetails[id],
		);
		if (!allStacksExist) {
			return { valid: false, reason: "Some stacks not found" };
		}
	}

	return { valid: true };
}

export function getAffectedStackIds(ctx: MoveContext): string[] {
	if (ctx.kind === "commit") {
		const ids = [ctx.sourceStackId, ctx.targetStackId].filter(isDefined);
		return [...new Set(ids)];
	} else {
		return ctx.orderedStackIds;
	}
}

export function getAffectedCommitIds(ctx: MoveContext): string[] {
	if (ctx.kind === "commit") {
		return ctx.subjectCommitIds;
	} else {
		return [];
	}
}
