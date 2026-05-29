use std::{
    collections::BTreeSet,
    path::{Path, PathBuf},
};

use anyhow::{Result, anyhow};
use but_api_macros::but_api;
use but_core::git_config::edit_config;
use but_ctx::{Context, ProjectHandleOrLegacyProjectId};
use but_error::Code;
use gix::bstr::ByteSlice;
use tracing::instrument;

#[but_api]
#[instrument(err(Debug))]
pub fn update_project(
    project: gitbutler_project::UpdateRequest,
) -> Result<gitbutler_project::api::Project> {
    Ok(gitbutler_project::update(project)?.into())
}

/// Adds an existing git repository as a GitButler project.
/// `path` is the Git repository to remember as project.
#[but_api]
#[instrument(err(Debug))]
pub fn add_project(path: PathBuf) -> Result<gitbutler_project::AddProjectOutcome> {
    gitbutler_project::add(&path)
}

/// Add a project by a given path.
/// It will look for other existing projects and try to match the path
/// to them, allowing to open projects from paths within the repository.
#[but_api]
#[instrument(err(Debug))]
pub fn add_project_best_effort(path: PathBuf) -> Result<gitbutler_project::AddProjectOutcome> {
    gitbutler_project::add_with_best_effort(&path)
}

#[but_api]
#[instrument(err(Debug))]
pub fn get_project(
    project_id: ProjectHandleOrLegacyProjectId,
    no_validation: Option<bool>,
) -> Result<gitbutler_project::api::Project> {
    let no_validation = no_validation.unwrap_or(false);
    match project_id {
        ProjectHandleOrLegacyProjectId::ProjectHandle(handle) => {
            if no_validation {
                let project = gitbutler_project::get_raw(
                    ProjectHandleOrLegacyProjectId::ProjectHandle(handle),
                )?
                .migrated()?
                .into();
                Ok(project)
            } else {
                Ok(gitbutler_project::get_validated(
                    ProjectHandleOrLegacyProjectId::ProjectHandle(handle),
                )?
                .into())
            }
        }
        ProjectHandleOrLegacyProjectId::LegacyProjectId(project_id) => Ok(if no_validation {
            gitbutler_project::get_raw(ProjectHandleOrLegacyProjectId::LegacyProjectId(project_id))?
                .migrated()?
                .into()
        } else {
            gitbutler_project::get_validated(ProjectHandleOrLegacyProjectId::LegacyProjectId(
                project_id,
            ))?
            .into()
        }),
    }
}

#[but_api(napi)]
#[instrument(err(Debug))]
pub fn list_projects_stateless() -> Result<Vec<ProjectForFrontend>> {
    list_projects(vec![])
}

/// List all stored projects for the frontend.
///
/// `opened_projects` identifies projects the frontend currently considers open so the returned
/// entries can be annotated with `is_open`. Stale opened-project handles are ignored because the
/// frontend may still hold them briefly after project deletion.
///
/// This front-end specific behaviour needs review when this comes out of legacy.
#[but_api]
#[instrument(err(Debug))]
pub fn list_projects(
    opened_projects: Vec<ProjectHandleOrLegacyProjectId>,
) -> Result<Vec<ProjectForFrontend>> {
    // Skip handles that can no longer be resolved — e.g. the project was just deleted
    // from storage but the frontend's `opened_projects` set hasn't caught up yet.
    // Failing the whole listing on a stale entry would break the post-deletion refresh
    // flow. Mirrors the warn-and-skip pattern used below for migration failures.
    let opened_projects: std::collections::HashSet<_> = opened_projects
        .into_iter()
        .filter_map(
            |project_id| match gitbutler_project::get_raw(project_id.clone()) {
                Ok(project) => Some(project.id),
                Err(err) => {
                    tracing::warn!(
                        ?err,
                        ?project_id,
                        "Skipping over opened project as its handle could not be resolved"
                    );
                    None
                }
            },
        )
        .collect();

    gitbutler_project::assure_app_can_startup_or_fix_it(
        gitbutler_project::dangerously_list_projects_without_migration(),
    )
    .map(|projects| {
        projects
            .into_iter()
            .map(|project| {
                anyhow::Ok(ProjectForFrontend {
                    is_open: opened_projects.contains(&project.id),
                    inner: project.migrated().map(Into::into)?,
                })
            })
            .filter_map(|res| match res {
                Ok(p) => Some(p),
                Err(err) => {
                    tracing::warn!(?err, "Skipping over project as it failed migration");
                    None
                }
            })
            .collect()
    })
}

#[but_api]
#[instrument(err(Debug))]
pub fn delete_project(project_id: ProjectHandleOrLegacyProjectId) -> Result<()> {
    delete_project_at_app_data_dir(but_path::app_data_dir()?, project_id)
}

fn delete_project_at_app_data_dir(
    app_data_dir: impl AsRef<Path>,
    project_id: ProjectHandleOrLegacyProjectId,
) -> Result<()> {
    gitbutler_project::delete_with_path(app_data_dir, project_id)
}

/// Prepare an already-known project for activation in the UI or server.
///
/// This repairs missing target metadata in freshly selected storage locations and then reconciles
/// the legacy metadata view with the workspace currently present in Git. It is safe for activation
/// paths because it avoids rewriting `gitbutler/workspace`.
pub fn prepare_project_for_activation(ctx: &mut Context) -> Result<()> {
    assure_repo_ownership(&*ctx.repo.get()?)?;
    let mut guard = ctx.exclusive_worktree_access();
    gitbutler_branch_actions::base::bootstrap_default_target_if_missing(ctx)?;
    super::meta::reconcile_in_workspace_state_of_vb_toml(ctx, guard.write_permission()).ok();
    Ok(())
}

// TODO(gix): remove this once there is no `git2` as `gix` provides safety by not trusting Git configuration instead.
fn assure_repo_ownership(repo: &gix::Repository) -> Result<()> {
    if repo.git_dir_trust() == gix::sec::Trust::Full {
        return Ok(());
    }

    let path = repo.workdir().unwrap_or(repo.git_dir());
    Err(anyhow!(
        "The git directory is considered unsafe as it's not owned by the current user. Use `git config --global --add safe.directory '{}'` to allow it",
        path.display()
    )
    .context(Code::RepoOwnership))
}

#[but_api]
#[instrument(err(Debug))]
pub fn is_gerrit(ctx: &but_ctx::Context) -> Result<bool> {
    gitbutler_project::gerrit::is_used_by_default_remote(&*ctx.repo.get()?)
}

#[but_api]
#[instrument(err(Debug))]
pub fn fix_repo_ownership(ctx: &Context, path: String) -> Result<()> {
    edit_config(None, gix::config::Source::User, |config| {
        but_core::git_config::ensure_config_value(config, "safe.directory", &path)?;
        Ok(())
    })?;
    Ok(())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[cfg_attr(feature = "export-schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "snake_case")]
pub enum HealthCheckSeverity {
    Critical,
    Warning,
    Info,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[cfg_attr(feature = "export-schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "snake_case")]
pub enum HealthCheckCategory {
    RepoOwnership,
    Permission,
    Remote,
    LfsFilter,
    Database,
    Sync,
}

#[derive(Debug, Clone, serde::Serialize)]
#[cfg_attr(feature = "export-schema", derive(schemars::JsonSchema))]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum HealthCheckFixAction {
    AddSafeDirectory { path: String },
    InvalidateHealthCache,
    RefreshBaseBranch,
    AddRemote,
    RunLfsPull,
}

#[derive(Debug, Clone, serde::Serialize)]
#[cfg_attr(feature = "export-schema", derive(schemars::JsonSchema))]
pub struct HealthCheckItem {
    pub id: String,
    pub category: HealthCheckCategory,
    pub severity: HealthCheckSeverity,
    pub message: String,
    pub fix_hint: Option<String>,
    pub fix_action: Option<HealthCheckFixAction>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[cfg_attr(feature = "export-schema", derive(schemars::JsonSchema))]
pub struct ProjectHealthReport {
    pub items: Vec<HealthCheckItem>,
}

#[but_api]
#[instrument(err(Debug))]
pub fn project_health_check(ctx: &Context) -> Result<ProjectHealthReport> {
    let mut items = Vec::new();

    check_repo_ownership(&*ctx.repo.get()?, &mut items);
    check_database(ctx.project_data_dir.clone(), &mut items);
    check_lfs_filters(&*ctx.repo.get()?, &mut items);
    check_remote_configuration(&*ctx.repo.get()?, &mut items);
    check_push_fetch_permission(ctx, &mut items);

    Ok(ProjectHealthReport { items })
}

fn check_repo_ownership(repo: &gix::Repository, items: &mut Vec<HealthCheckItem>) {
    if repo.git_dir_trust() == gix::sec::Trust::Full {
        return;
    }
    let path = repo.workdir().unwrap_or(repo.git_dir());
    let path_str = path.display().to_string();
    items.push(HealthCheckItem {
        id: "repo_ownership".into(),
        category: HealthCheckCategory::RepoOwnership,
        severity: HealthCheckSeverity::Critical,
        message: format!(
            "The git directory is not owned by the current user: {path_str}"
        ),
        fix_hint: Some(format!(
            "Run `git config --global --add safe.directory '{path_str}'` or click Fix to apply it automatically."
        )),
        fix_action: Some(HealthCheckFixAction::AddSafeDirectory {
            path: path_str,
        }),
    });
}

fn check_database(data_dir: PathBuf, items: &mut Vec<HealthCheckItem>) {
    let db_path = but_db::DbHandle::db_file_path(&data_dir);
    if let Err(err) = but_db::DbHandle::new_in_directory(&data_dir) {
        let message = if db_path.exists() {
            format!(
                "Database at '{}' could not be opened: {err}",
                db_path.display()
            )
        } else {
            format!("Database file not found at '{}'", db_path.display())
        };
        items.push(HealthCheckItem {
            id: "db_error".into(),
            category: HealthCheckCategory::Database,
            severity: HealthCheckSeverity::Warning,
            message,
            fix_hint: Some(
                "The database may be corrupted or was created by a newer version. It will be backed up and recreated on next activation.".into(),
            ),
            fix_action: Some(HealthCheckFixAction::InvalidateHealthCache),
        });
    }
}

fn check_lfs_filters(repo: &gix::Repository, items: &mut Vec<HealthCheckItem>) {
    let index = match repo.index_or_empty() {
        Ok(idx) => idx,
        Err(_) => return,
    };
    let mut cache = match repo.attributes_only(
        &index,
        gix::worktree::stack::state::attributes::Source::WorktreeThenIdMapping,
    ) {
        Ok(c) => c,
        Err(_) => return,
    };
    let mut attrs = cache.selected_attribute_matches(Some("filter"));
    let mut all_filters = BTreeSet::<String>::new();
    let mut files_with_filter = Vec::new();
    for entry in index.entries() {
        let cache_entry = match cache.at_entry(entry.path(&index), None) {
            Ok(e) => e,
            Err(_) => continue,
        };
        if cache_entry.matching_attributes(&mut attrs) {
            let mut added = false;
            all_filters.extend(attrs.iter().filter_map(|attr| {
                attr.assignment.state.as_bstr().map(|s| {
                    if !added {
                        files_with_filter.push(entry.path(&index).to_str_lossy());
                        added = true;
                    }
                    s.to_string()
                })
            }));
        }
    }
    if all_filters.is_empty() {
        return;
    }
    let has_lfs = all_filters.contains("lfs");
    let filter_names = Vec::from_iter(all_filters).join(", ");
    let mut message = format!(
        "Worktree filter(s) detected: {filter_names}. \
         Filters will silently not be applied during workspace operations."
    );
    if has_lfs {
        message.push_str(" Git LFS tracked files may be affected.");
    }
    let mut fix_hint = String::from("Avoid using GitButler on files that require these filters.");
    if has_lfs {
        fix_hint.push_str(" Click Run LFS Pull to restore LFS tracked files.");
    }
    items.push(HealthCheckItem {
        id: "lfs_filter".into(),
        category: HealthCheckCategory::LfsFilter,
        severity: if has_lfs {
            HealthCheckSeverity::Warning
        } else {
            HealthCheckSeverity::Info
        },
        message,
        fix_hint: Some(fix_hint),
        fix_action: if has_lfs {
            Some(HealthCheckFixAction::RunLfsPull)
        } else {
            None
        },
    });
}

fn check_remote_configuration(repo: &gix::Repository, items: &mut Vec<HealthCheckItem>) {
    let remotes = repo.remote_names();
    if remotes.is_empty() {
        items.push(HealthCheckItem {
            id: "no_remote".into(),
            category: HealthCheckCategory::Remote,
            severity: HealthCheckSeverity::Warning,
            message: "No Git remote is configured for this repository.".into(),
            fix_hint: Some(
                "Add a remote (e.g. `git remote add origin <url>`) or click Add Remote to configure one.".into(),
            ),
            fix_action: Some(HealthCheckFixAction::AddRemote),
        });
    }
}

fn check_push_fetch_permission(ctx: &Context, items: &mut Vec<HealthCheckItem>) {
    let guard = ctx.shared_worktree_access();
    if let Ok(base_branch_result) = gitbutler_branch_actions::base::get_base_branch_data(
        ctx,
        guard.read_permission(),
    ) {
        if base_branch_result.last_fetched_ms.is_none() {
            items.push(HealthCheckItem {
                id: "never_fetched".into(),
                category: HealthCheckCategory::Sync,
                severity: HealthCheckSeverity::Warning,
                message: "Background sync has not yet fetched from the remote. The local data may be stale."
                    .into(),
                fix_hint: Some(
                    "Click Fix to fetch the remote data. This verifies your credentials are valid and your local data is up to date.".into(),
                ),
                fix_action: Some(HealthCheckFixAction::RefreshBaseBranch),
            });
        }

        if base_branch_result.conflicted {
            items.push(HealthCheckItem {
                id: "sync_conflict".into(),
                category: HealthCheckCategory::Sync,
                severity: HealthCheckSeverity::Warning,
                message: "The base branch is in a conflicted state. Background sync operations may fail until conflicts are resolved."
                    .into(),
                fix_hint: Some(
                    "Fetching the latest changes from upstream may help resolve this. Click Fix to fetch from the remote.".into(),
                ),
                fix_action: Some(HealthCheckFixAction::RefreshBaseBranch),
            });
        }
    } else {
        items.push(HealthCheckItem {
            id: "no_base_branch".into(),
            category: HealthCheckCategory::Sync,
            severity: HealthCheckSeverity::Warning,
            message: "No base branch configured. Background sync will not operate until you select a target branch.".into(),
            fix_hint: Some(
                "Complete the onboarding process or configure a target branch for this project.".into(),
            ),
            fix_action: None,
        });
    }
}

#[derive(serde::Serialize)]
#[cfg_attr(feature = "export-schema", derive(schemars::JsonSchema))]
pub struct ProjectForFrontend {
    #[serde(flatten)]
    pub inner: gitbutler_project::api::Project,
    /// Tell if the project is known to be open in a Window in the frontend.
    pub is_open: bool,
}
#[cfg(feature = "export-schema")]
but_schemars::register_sdk_type!(ProjectForFrontend);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn delete_project_is_idempotent() -> Result<()> {
        let app_data_dir = tempfile::tempdir()?;
        let repo_dir = tempfile::tempdir()?;
        gix::init(repo_dir.path())?;
        let project = gitbutler_project::add_at_app_data_dir(app_data_dir.path(), repo_dir.path())?
            .unwrap_project();
        let project_id = project.id.clone();

        delete_project_at_app_data_dir(app_data_dir.path(), project_id.clone())?;
        delete_project_at_app_data_dir(app_data_dir.path(), project_id.clone())?;

        assert!(gitbutler_project::get_with_path(app_data_dir.path(), project_id).is_err());
        Ok(())
    }
}
