import { createCommandHandlers } from "$lib/stacks/commandHandlers";
import { StackCommandExecutor } from "$lib/stacks/commandExecutor";
import { STACK_COMMAND_EXECUTOR } from "$lib/stacks/commandExecutor";
import type { CommandServices } from "$lib/stacks/commandExecutor";
import type { ForgePrService } from "$lib/forge/interface/forgePrService";

interface CreateExecutorOptions {
	services: CommandServices;
	prService?: ForgePrService;
	baseBranchName?: string;
}

export function createStackCommandExecutor(options: CreateExecutorOptions): StackCommandExecutor {
	const { services, prService, baseBranchName } = options;

	const handlers = createCommandHandlers({
		prService,
		baseBranchName,
	});

	return new StackCommandExecutor(services, handlers);
}

export { STACK_COMMAND_EXECUTOR };
