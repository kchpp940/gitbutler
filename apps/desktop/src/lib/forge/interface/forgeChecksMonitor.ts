import type { ChecksStatus } from "$lib/forge/interface/types";
import type { QueryExtensions, QueryOptions, ReactiveQuery } from "$lib/state/butlerModule";

export interface ChecksService {
	get(branch: string): ReactiveQuery<ChecksStatus | null, QueryExtensions>;
	fetch(branch: string, options?: QueryOptions): Promise<ChecksStatus | null>;
}
