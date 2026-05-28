use std::{
    collections::BTreeSet,
    path::{Path, PathBuf},
};

use anyhow::{Context as _, bail};
use but_api::json;
use but_ctx::{Context, ProjectHandleOrLegacyProjectId};
use but_settings::AppSettingsWithDiskSync;
use gix::bstr::ByteSlice;
use tauri::{State, Window};
use tracing::instrument;

use crate::{WindowState, window, window::state::ProjectAccessMode};

#[tauri::command(async)]
#[instrument(skip(window_state), err(Debug))]
pub fn list_projects(
    window_state: State<'_, WindowState>,
) -> Result<Vec<but_api::legacy::projects::ProjectForFrontend>, json::Error> {
    let open_projects = window_state.open_projects();
    but_api::legacy::projects::list_projects(open_projects).map_err(Into::into)
}

/// Reports capabilities that vary by how the backend was launched.
/// In the Tauri app these are always "local-mode" values — the user is
/// by definition on the same machine.
#[tauri::command(async)]
pub fn server_capabilities() -> Result<but_api::platform::ServerCapabilities, json::Error> {
    Ok(but_api::platform::ServerCapabilities {
        is_remote: false,
        can_add_projects: true,
    })
}

/// A structured warning or error that occurred during project activation.
#[derive(Debug, serde::Serialize, strum::Display, Clone)]
#[serde(tag = "code", content = "details")]
pub enum ProjectActivationIssue {
    /// The project database was corrupted and has been recovered.
    DatabaseCorrupted {
        /// The database file path that was corrupted.
        db_path: String,
        /// The backup path where the corrupted database was moved.
        backup_path: String,
        /// The raw error message for debugging.
        error: String,
    },
    /// The project uses Git filters (like LFS) that may cause issues.
    FilterWarning {
        /// List of filter names detected (e.g., "lfs").
        filters: Vec<String>,
        /// Sample of files affected by filters.
        affected_files: Vec<String>,
        /// Whether LFS is among the detected filters.
        has_lfs: bool,
    },
    /// The project is already open in another window.
    AlreadyOpenInAnotherWindow,
    /// Insufficient permissions to access the repository.
    PermissionDenied {
        /// The path that couldn't be accessed.
        path: String,
    },
}

/// Additional information to help the user interface communicate what happened with the project.
#[derive(Debug, serde::Serialize)]
pub struct ProjectInfo {
    /// `true` if the window is the first one to open the project.
    is_exclusive: bool,
    /// Issues encountered during project activation (warnings and recoverable errors).
    issues: Vec<ProjectActivationIssue>,
}

/// This trigger is the GUI telling us that the project with `id` is now displayed.
/// Return `true` if the project is opened exclusively, i.e. there is no other Window looking at it.
///
/// We use it to start watching for filesystem events.
#[tauri::command(async)]
#[instrument(skip(window_state, window, app_settings_sync), err(Debug), ret)]
pub fn set_project_active(
    window_state: State<'_, WindowState>,
    app_settings_sync: tauri::State<'_, AppSettingsWithDiskSync>,
    window: Window,
    id: ProjectHandleOrLegacyProjectId,
) -> Result<Option<ProjectInfo>, json::Error> {
    // We don't get the legacy object in a validated fashion anymore, but that should be fine
    // as this only tries to open a Repo, and that's something we do later here as well.
    let mut ctx: Context = match id.clone().try_into() {
        Ok(ctx) => ctx,
        Err(err) => {
            tracing::warn!("Project with ID {id} not found, cannot set it active: {err}");
            return Ok(None);
        }
    };
    but_api::legacy::projects::prepare_project_for_activation(&mut ctx)?;

    let mut issues: Vec<ProjectActivationIssue> = Vec::new();

    if let Some(db_issue) = assure_database_valid(ctx.project_data_dir())? {
        tracing::error!("{}", db_issue);
        issues.push(db_issue);
    }

    if let Some(filter_issue) = warn_about_filters_and_git_lfs(&*ctx.repo.get()?)? {
        tracing::warn!("{}", filter_issue);
        issues.push(filter_issue);
    }

    let mode = window_state.set_project_to_window(window.label(), &app_settings_sync, &mut ctx)?;
    let is_exclusive = match mode {
        ProjectAccessMode::First => true,
        ProjectAccessMode::Shared => false,
    };

    if !is_exclusive {
        issues.push(ProjectActivationIssue::AlreadyOpenInAnotherWindow);
    }

    Ok(Some(ProjectInfo {
        is_exclusive,
        issues,
    }))
}

/// Open the project with the given ID in a new Window, or focus an existing one.
///
/// Note that this command is blocking the main thread just to prevent the chance for races
/// without having to lock explicitly.
#[tauri::command]
#[instrument(skip(handle), err(Debug))]
pub fn open_project_in_window(
    handle: tauri::AppHandle,
    id: ProjectHandleOrLegacyProjectId,
) -> Result<(), json::Error> {
    let label = std::time::UNIX_EPOCH
        .elapsed()
        .or_else(|_| std::time::UNIX_EPOCH.duration_since(std::time::SystemTime::now()))
        .map(|d| d.as_millis().to_string())
        .context("didn't manage to get any time-based unique ID")?;
    window::create(&handle, &label, id.to_string()).map_err(anyhow::Error::from)?;
    Ok(())
}

/// Fatal errors are returned as error, fixed errors for tracing will be `Some(err)`
#[instrument(level = "debug")]
fn assure_database_valid(data_dir: PathBuf) -> anyhow::Result<Option<ProjectActivationIssue>> {
    use rusqlite::ErrorCode;
    if let Err(err) = but_db::DbHandle::new_in_directory(&data_dir) {
        let db_path = but_db::DbHandle::db_file_path(&data_dir);
        if let Some(but_db::migration::Error::Permanent(sql_err)) =
            err.downcast_ref::<but_db::migration::Error>()
            && (!matches!(
                sql_err.sqlite_error_code(),
                Some(ErrorCode::DatabaseCorrupt | ErrorCode::NotADatabase)
            ) || matches!(sql_err, rusqlite::Error::ToSqlConversionFailure(_)))
        {
            return Err(err)
                .with_context(|| {
                    format!(
                        "Cannot recover from this error - probably a more recent version of\n\
                         this app was used to open the project. '{}' is incompatible",
                        db_path.display()
                    )
                })
                .context(but_error::Code::ProjectDatabaseIncompatible);
        }
        let db_filename = db_path.file_name().unwrap();
        let max_attempts = 255;
        for round in 1..max_attempts {
            let backup_path = data_dir.join(format!(
                "{db_name}.maybe-broken-{round:02}",
                db_name = Path::new(db_filename).display()
            ));
            if backup_path.is_file() {
                continue;
            }

            if let Err(err) = std::fs::rename(&db_path, &backup_path) {
                return Err(err)
                    .context(format!(
                        "Failed to rename {} to {}",
                        db_path.display(),
                        backup_path.display()
                    ))
                    .context(but_error::Code::ProjectDatabaseCorrupted);
            }

            return Ok(Some(ProjectActivationIssue::DatabaseCorrupted {
                db_path: db_path.display().to_string(),
                backup_path: backup_path.display().to_string(),
                error: err.to_string(),
            }));
        }
        bail!(
            "Database file at '{db_path} has {max_attempts} corrupted copies - giving up, application probably won't work",
            db_path = db_path.display()
        );
    }
    Ok(None)
}

/// Check for Git filters like LFS and return a structured warning if found.
fn warn_about_filters_and_git_lfs(
    repo: &gix::Repository,
) -> anyhow::Result<Option<ProjectActivationIssue>> {
    let index = repo.index_or_empty()?;
    let mut cache = repo.attributes_only(
        &index,
        gix::worktree::stack::state::attributes::Source::WorktreeThenIdMapping,
    )?;
    let mut attrs = cache.selected_attribute_matches(Some("filter"));
    let mut all_filters = BTreeSet::<String>::new();
    let mut files_with_filter = Vec::new();
    for entry in index.entries() {
        let cache_entry = cache.at_entry(entry.path(&index), None)?;
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
        return Ok(None);
    }

    let has_lfs = all_filters.contains("lfs");
    let max_files = 10;
    let filters: Vec<String> = all_filters.into_iter().collect();
    let affected_files: Vec<String> = files_with_filter
        .into_iter()
        .take(max_files)
        .collect();

    Ok(Some(ProjectActivationIssue::FilterWarning {
        filters,
        affected_files,
        has_lfs,
    }))
}
