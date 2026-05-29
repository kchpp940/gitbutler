import { invalidatesList, ReduxTag } from "$lib/state/tags";
import { InjectionToken } from "@gitbutler/core/context";
import type { ProjectHealthReport, HealthCheckItem, HealthCheckFixAction } from "$lib/project/projectEndpoints";
import type { IBackend } from "$lib/backend";
import type { BackendApi } from "$lib/state/backendApi";
import type { AppDispatch } from "$lib/state/clientState.svelte";
import { BASE_BRANCH_SERVICE } from "$lib/baseBranch/baseBranchService.svelte";
import type { BaseBranchService } from "$lib/baseBranch/baseBranchService.svelte";

export const HEALTH_CHECK_SERVICE = new InjectionToken<HealthCheckService>("HealthCheckService");

export class HealthCheckService {
	constructor(
		private backendApi: BackendApi,
		private dispatch: AppDispatch,
		private backend: IBackend,
		private baseBranchService: BaseBranchService,
	) {}

	useReport(projectId: string) {
		return this.backendApi.endpoints.projectHealthCheck.useQuery({ projectId });
	}

	async fetchReport(projectId: string): Promise<ProjectHealthReport | undefined> {
		return await this.backendApi.endpoints.projectHealthCheck.fetch({ projectId });
	}

	invalidate(projectId: string) {
		this.dispatch(
			this.backendApi.util.invalidateTags([
				{ type: ReduxTag.ProjectHealth, id: projectId },
			]),
		);
	}

	invalidateAll() {
		this.dispatch(
			this.backendApi.util.invalidateTags([invalidatesList(ReduxTag.ProjectHealth)]),
		);
	}

	async executeFix(projectId: string, action: HealthCheckFixAction): Promise<{
		success: boolean;
		error?: string;
	}> {
		switch (action.type) {
			case "add_safe_directory": {
				try {
					await this.backend.invoke("fix_repo_ownership", {
						projectId,
						path: action.path,
					});
					this.invalidate(projectId);
					return { success: true };
				} catch (e) {
					return {
						success: false,
						error: e instanceof Error ? e.message : String(e),
					};
				}
			}
			case "refresh_base_branch": {
				try {
					await this.baseBranchService.fetchFromRemotes(projectId, "modal");
					this.invalidate(projectId);
					this.dispatch(
						this.backendApi.util.invalidateTags([
							{ type: ReduxTag.ProjectGerrit, id: projectId },
						]),
					);
					return { success: true };
				} catch (e) {
					return {
						success: false,
						error: e instanceof Error ? e.message : String(e),
					};
				}
			}
			case "invalidate_health_cache": {
				this.invalidate(projectId);
				return { success: true };
			}
			case "add_remote": {
				return { success: false, error: "Requires UI modal for name and URL input" };
			}
			case "run_lfs_pull": {
				try {
					await this.backend.invoke("git_run_lfs_pull", { projectId });
					this.invalidate(projectId);
					return { success: true };
				} catch (e) {
					return {
						success: false,
						error: e instanceof Error ? e.message : String(e),
					};
				}
			}
		}
	}

	static summarize(report: ProjectHealthReport | undefined): {
		critical: number;
		warnings: number;
		info: number;
		total: number;
		worst: "critical" | "warning" | "info" | "ok";
	} {
		if (!report || report.items.length === 0) {
			return { critical: 0, warnings: 0, info: 0, total: 0, worst: "ok" };
		}
		const critical = report.items.filter((i) => i.severity === "critical").length;
		const warnings = report.items.filter((i) => i.severity === "warning").length;
		const info = report.items.filter((i) => i.severity === "info").length;
		const worst = critical > 0 ? "critical" : warnings > 0 ? "warning" : info > 0 ? "info" : "ok";
		return { critical, warnings, info, total: report.items.length, worst };
	}
}
