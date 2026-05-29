import {
	FileChangeDropData,
	FolderChangeDropData,
	HunkDropDataV3,
	type ChangeDropData,
} from "$lib/dragging/draggables";
import { type DiffService } from "$lib/hunks/diffService.svelte";
import type { DropzoneHandler } from "$lib/dragging/handler";
import type { FileChangesViewModel } from "$lib/selection/fileChangesViewModel.svelte";
import type { UncommittedService } from "$lib/selection/uncommittedService.svelte";
import type { HunkAssignmentTarget } from "@gitbutler/but-sdk";

export class AssignmentDropHandler implements DropzoneHandler {
	constructor(
		private readonly projectId: string,
		private readonly diffService: DiffService,
		private readonly uncommittedService: UncommittedService,
		private readonly stackId: string | undefined,
		private readonly viewModel: FileChangesViewModel,
	) {}

	private get assignmentTarget(): HunkAssignmentTarget | null {
		const stackId = this.stackId;
		if (stackId === undefined) return null;
		return { type: "stack", subject: { stackId } };
	}

	accepts(data: unknown) {
		if (data instanceof FileChangeDropData || data instanceof FolderChangeDropData) {
			if (data.isCommitted) return false;
			if (data.stackId === this.stackId) return false;
			return true;
		}
		if (data instanceof HunkDropDataV3) {
			if (!data.uncommitted) return false;
			if (data.selectionId.type !== "worktree") return false;
			if (data.selectionId.stackId === this.stackId) return false;
			return true;
		}
		return false;
	}

	async ondrop(data: ChangeDropData | HunkDropDataV3) {
		if (data.stackId === this.stackId) return;
		if (data instanceof FileChangeDropData) {
			const changes = await data.treeChanges();
			const assignments = changes
				.flatMap((c) => this.uncommittedService.getAssignmentsByPath(data.stackId || null, c.path))
				.map((h) => ({
					hunkHeader: h.hunkHeader,
					pathBytes: h.pathBytes,
					target: this.assignmentTarget,
				}));
			await this.diffService.assignHunk({
				projectId: this.projectId,
				assignments,
			});

			const movedPaths = changes.map((change) => change.path);
			this.viewModel.removeSelectedPaths(movedPaths);
			this.viewModel.clearPreview();
		} else if (data instanceof FolderChangeDropData) {
			const changes = await data.treeChanges();
			const assignments = changes
				.flatMap((c) => this.uncommittedService.getAssignmentsByPath(data.stackId || null, c.path))
				.map((h) => ({
					hunkHeader: h.hunkHeader,
					pathBytes: h.pathBytes,
					target: this.assignmentTarget,
				}));
			await this.diffService.assignHunk({
				projectId: this.projectId,
				assignments,
			});

			const movedPaths = changes.map((change) => change.path);
			this.viewModel.removeSelectedPaths(movedPaths);
			this.viewModel.clearPreview();
		} else {
			const assignment = this.uncommittedService.getAssignmentByHeader(
				data.stackId,
				data.change.path,
				data.hunk,
			).current!;
			const allAssignments = this.uncommittedService.getAssignmentsByPath(
				data.stackId,
				data.change.path,
			);
			await this.diffService.assignHunk({
				projectId: this.projectId,
				assignments: [
					{
						hunkHeader: assignment.hunkHeader,
						pathBytes: assignment.pathBytes,
						target: this.assignmentTarget,
					},
				],
			});

			if (allAssignments.length === 1) {
				this.viewModel.removeSelectedPaths([data.change.path]);
				this.viewModel.clearPreview();
			}
		}
	}
}
