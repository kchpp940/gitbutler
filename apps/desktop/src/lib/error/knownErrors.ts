import type { Code } from "@gitbutler/but-sdk";

/**
 * Long-form, user-facing descriptions for error codes that benefit from
 * additional context (setup instructions, remediation steps, etc.). Keyed by
 * the wire-level `Code` name generated from the Rust `but_error::Code` enum.
 */
export const KNOWN_ERRORS: Partial<Record<Code, string>> = {
	CommitSigningFailed: `
Commit signing failed and has now been disabled. You can configure commit signing in the project settings.

Please check our [documentation](https://docs.gitbutler.com/features/virtual-branches/signing-commits) on setting up commit signing and verification.
		`,
	RepoOwnership: `
The repository ownership couldn't be determined. Consider allowing it using:

    git config --global --add safe.directory copy/of/path/shown/below
	`,
	SecretKeychainNotFound: `
Please install a keychain service to store and retrieve secrets with.

This can be done using \`sudo apt install gnome-keyring\` for instance.
	`,
	MissingLoginKeychain: `
Missing default keychain.

With \`seahorse\` or equivalent, create a \`Login\` password store, right click it and choose \`Set Default\`.
	`,
	GitHubTokenExpired: `
Your GitHub token appears expired. Please log out and back in to refresh it. (Settings -> Integrations -> Forget)
	`,
	ProjectDatabaseIncompatible: `
The database was changed by a more recent version of GitButler - cannot safely open it anymore.
	`,
	DefaultTerminalNotFound: `
Your default terminal was not found. Please select your preferred terminal in Settings > General.
	`,
	ProjectDatabaseCorrupted: `
The project database was corrupted. It has been backed up and a new database has been created.

Your Git worktree is untouched - you may need to re-configure your virtual branches.
	`,
	ProjectFilterWarning: `
This repository uses Git filters (like Git LFS) that may not work correctly with GitButler.

Filters will silently not be applied during workspace operations. If you use Git LFS, you can restore files after operations with:
    git lfs pull --include="*"
	`,
	ProjectPermissionDenied: `
GitButler doesn't have sufficient permissions to access this repository.

Please check the file and directory permissions for the project path and ensure the current user has read/write access.
	`,
	ProjectAlreadyOpenInAnotherWindow: `
This project is already open in another window.

Opening the same project in multiple windows can cause unexpected behavior.
	`,
	ProjectInvalidGitRepository: `
The selected path is not a valid Git repository.

Please select a directory that contains a .git folder or initialize a Git repository first with:
    git init
	`,
};
