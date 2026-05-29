import { InjectionToken } from "@gitbutler/core/context";

export type BranchesSelection =
	| {
			type: "branch";
			branchName: string;
			remote?: string;
			stackId?: string;
			commitId?: string;
	  }
	| { type: "pr"; prNumber: number }
	| { type: "target"; commitId?: string };

export const BRANCHES_SELECTION_STORE = new InjectionToken<BranchesSelectionStore>(
	"BranchesSelectionStore",
);

export class BranchesSelectionStore {
	private projectSelections = new Map<string, BranchesSelection>();
	private pendingPrRestores = new Map<string, { open: boolean; prNumber: number | null }>();

	get(projectId: string): BranchesSelection {
		return this.projectSelections.get(projectId) ?? { type: "target" };
	}

	set(projectId: string, selection: BranchesSelection): void {
		this.projectSelections.set(projectId, selection);
	}

	capturePrState(projectId: string): { open: boolean; prNumber: number | null } {
		const sel = this.projectSelections.get(projectId);
		if (sel?.type === "pr") {
			return { open: true, prNumber: sel.prNumber };
		}
		return { open: false, prNumber: null };
	}

	enqueuePrRestore(projectId: string, open: boolean, prNumber: number | null): void {
		this.pendingPrRestores.set(projectId, { open, prNumber });
	}

	consumePendingPrRestore(projectId: string): void {
		const pending = this.pendingPrRestores.get(projectId);
		if (!pending) return;
		this.pendingPrRestores.delete(projectId);
		if (pending.open && pending.prNumber !== null) {
			this.projectSelections.set(projectId, { type: "pr", prNumber: pending.prNumber });
		}
	}

	hasPendingPrRestore(projectId: string): boolean {
		return this.pendingPrRestores.has(projectId);
	}

	clearProject(projectId: string): void {
		this.projectSelections.delete(projectId);
		this.pendingPrRestores.delete(projectId);
	}
}
