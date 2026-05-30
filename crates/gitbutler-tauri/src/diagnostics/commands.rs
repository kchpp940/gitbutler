use crate::diagnostics::{self, checkers};
use crate::WindowState;
use anyhow::anyhow;
use but_api::json;
use std::path::PathBuf;
use tauri::State;
use tracing::instrument;

#[tauri::command(async)]
#[instrument(skip(_window_state), err(Debug))]
pub async fn run_startup_diagnostics(
    _window_state: State<'_, WindowState>,
    node_required_major: Option<u64>,
    pnpm_required_major: Option<u64>,
    project_root: Option<PathBuf>,
    skip_development_checks: Option<bool>,
) -> Result<diagnostics::DiagnosticResult, json::Error> {
    let is_production = !cfg!(debug_assertions);
    let skip_dev_checks = skip_development_checks.unwrap_or(is_production);

    let result = checkers::run_all_checks(
        node_required_major.unwrap_or(20),
        pnpm_required_major.unwrap_or(9),
        project_root,
        skip_dev_checks,
    )
    .await;

    Ok(result)
}

#[tauri::command(async)]
#[instrument(err(Debug))]
pub async fn run_single_diagnostic_check(
    check_id: String,
    node_required_major: Option<u64>,
    pnpm_required_major: Option<u64>,
    project_root: Option<PathBuf>,
) -> Result<diagnostics::DiagnosticCheck, json::Error> {
    let check = match check_id.as_str() {
        "node-version" => {
            checkers::node::check_node_version(node_required_major.unwrap_or(20)).await
        }
        "pnpm-version" => {
            checkers::pnpm::check_pnpm_version(pnpm_required_major.unwrap_or(9)).await
        }
        "rust-toolchain" => checkers::rust::check_rust_toolchain().await,
        "tauri-cli" => checkers::tauri::check_tauri_cli().await,
        "backend-command" => checkers::backend::check_backend_command().await,
        "frontend-deps" => {
            checkers::dependencies::check_frontend_dependencies(project_root).await
        }
        "local-config" => checkers::config::check_local_config().await,
        _ => {
            return Err(anyhow!("Unknown diagnostic check: {}", check_id).into());
        }
    };

    Ok(check)
}

#[tauri::command(async)]
#[instrument(err(Debug))]
pub async fn get_diagnostic_check_ids() -> Result<Vec<String>, json::Error> {
    Ok(vec![
        "node-version".to_string(),
        "pnpm-version".to_string(),
        "rust-toolchain".to_string(),
        "tauri-cli".to_string(),
        "backend-command".to_string(),
        "frontend-deps".to_string(),
        "local-config".to_string(),
    ])
}
