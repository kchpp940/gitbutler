import { unstackPRs, updateStackPrs } from "$lib/forge/shared/prFooter";
import type { ForgePrService } from "$lib/forge/interface/forgePrService";
import type { StackService } from "$lib/stacks/stackService.svelte";

export async function updatePrDescriptions(
	stackService: StackService,
	prService: ForgePrService,
	baseBranchName: string,
	projectId: string,
	sourceStackId: string,
	targetStackId?: string,
	sourceStackDeleted?: boolean,
): Promise<void> {
	if (!sourceStackDeleted) {
		const branchDetails = await stackService.fetchBranches(projectId, sourceStackId);
		await updateStackPrs(prService, branchDetails, baseBranchName);
	}

	if (targetStackId) {
		const targetBranchDetails = await stackService.fetchBranches(projectId, targetStackId);
		await updateStackPrs(prService, targetBranchDetails, baseBranchName);
	}
}
